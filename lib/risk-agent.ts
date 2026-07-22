import { getSupabaseAdmin } from './supabase/server';
import { InvoiceExtraction, RiskResult, RiskResultSchema } from './invoice-schema';

export interface RiskDataSource {
  duplicateHash(currentId: string, fileHash: string): Promise<{ id: string } | null>;
  duplicateNumber(currentId: string, invoiceNumber: string): Promise<{ id: string } | null>;
  vendorAmounts(currentId: string, vendor: string): Promise<number[]>;
  vendorProfile(vendor: string): Promise<{ recipient_wallet: string | null; payment_limit: number | null } | null>;
}

export const supabaseRiskDataSource: RiskDataSource = {
  async duplicateHash(currentId, fileHash) {
    const { data, error } = await getSupabaseAdmin().from('invoices').select('id').eq('file_hash', fileHash).neq('id', currentId).limit(1).maybeSingle();
    if (error) throw new Error(`Duplicate hash check failed: ${error.message}`);
    return data;
  },
  async duplicateNumber(currentId, invoiceNumber) {
    const { data, error } = await getSupabaseAdmin().from('invoices').select('id').eq('invoice_number', invoiceNumber).neq('id', currentId).limit(1).maybeSingle();
    if (error) throw new Error(`Duplicate invoice check failed: ${error.message}`);
    return data;
  },
  async vendorAmounts(currentId, vendor) {
    const { data, error } = await getSupabaseAdmin().from('invoices').select('amount').eq('vendor', vendor).neq('id', currentId).not('amount', 'is', null);
    if (error) throw new Error(`Vendor history check failed: ${error.message}`);
    return (data || []).map(row => Number(row.amount)).filter(Number.isFinite);
  },
  async vendorProfile(vendor) {
    const { data, error } = await getSupabaseAdmin().from('vendor_profiles').select('recipient_wallet,payment_limit').eq('vendor', vendor).maybeSingle();
    if (error) throw new Error(`Vendor profile check failed: ${error.message}`);
    return data ? { recipient_wallet:data.recipient_wallet, payment_limit:data.payment_limit === null ? null : Number(data.payment_limit) } : null;
  },
};

export async function assessInvoiceRisk(currentId: string, fileHash: string, x: InvoiceExtraction, source: RiskDataSource = supabaseRiskDataSource): Promise<RiskResult> {
  const flags: RiskResult['flags'] = [];
  let score = 0;

  const duplicateHash = await source.duplicateHash(currentId, fileHash);
  if (duplicateHash) {
    score += 100;
    flags.push({ code:'DUPLICATE_FILE', severity:'CRITICAL', message:'Identical PDF was uploaded before.', evidence:`SHA-256 matches ${duplicateHash.id}` });
  }

  const duplicateNumber = await source.duplicateNumber(currentId, x.invoiceNumber);
  if (duplicateNumber) {
    score += 80;
    flags.push({ code:'DUPLICATE_INVOICE_NUMBER', severity:'HIGH', message:'Invoice number already exists.', evidence:`Matches ${duplicateNumber.id}` });
  }

  const amounts = await source.vendorAmounts(currentId, x.vendor);
  const average = amounts.length ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : null;
  if (amounts.length >= 3 && average && x.amount > average * 2) {
    score += 35;
    flags.push({ code:'AMOUNT_ANOMALY', severity:'HIGH', message:'Amount is more than twice the vendor historical average.', evidence:`amount=${x.amount}; average=${average.toFixed(2)}; samples=${amounts.length}` });
  }

  const profile = await source.vendorProfile(x.vendor);

  if (profile?.recipient_wallet && x.recipientWallet && x.recipientWallet.toLowerCase() !== profile.recipient_wallet.toLowerCase()) {
    score += 60;
    flags.push({ code:'WALLET_MISMATCH', severity:'CRITICAL', message:'Recipient wallet differs from vendor profile.', evidence:`expected=${profile.recipient_wallet}; received=${x.recipientWallet || '(missing)'}` });
  }
  if (profile?.payment_limit && x.amount > Number(profile.payment_limit)) {
    score += 35;
    flags.push({ code:'PAYMENT_LIMIT', severity:'HIGH', message:'Amount exceeds vendor payment limit.', evidence:`amount=${x.amount}; limit=${profile.payment_limit}` });
  }
  if (!x.recipientWallet) {
    score += 80;
    flags.push({ code:'MISSING_RECIPIENT_WALLET', severity:'CRITICAL', message:'Recipient wallet is required before proposing payment.', evidence:'recipientWallet is absent from the source invoice' });
  } else if (x.missingFields.length) {
    score += 25;
    flags.push({ code:'MISSING_REQUIRED_FIELDS', severity:'MEDIUM', message:'Required invoice fields are missing.', evidence:[...new Set(x.missingFields)].join(', ') });
  }
  if (x.confidence < 0.75) {
    score += 25;
    flags.push({ code:'LOW_CONFIDENCE', severity:'MEDIUM', message:'AI extraction confidence is below threshold.', evidence:`confidence=${x.confidence}` });
  }

  score = Math.min(100, score);
  const decision = score >= 80 ? 'BLOCK' : score >= 40 ? 'ESCALATE' : 'AUTO_PROPOSE';
  return RiskResultSchema.parse({ score, decision, flags });
}
