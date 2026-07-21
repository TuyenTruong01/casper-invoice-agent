import { getDb } from './db';
import { InvoiceExtraction, RiskResult, RiskResultSchema } from './invoice-schema';

export function assessInvoiceRisk(currentId: string, fileHash: string, x: InvoiceExtraction): RiskResult {
  const db = getDb();
  const flags: RiskResult['flags'] = [];
  let score = 0;
  const duplicateHash = db.prepare('SELECT id FROM invoices WHERE file_hash = ? AND id <> ? LIMIT 1').get(fileHash, currentId) as { id: string } | undefined;
  if (duplicateHash) { score += 100; flags.push({ code:'DUPLICATE_FILE', severity:'CRITICAL', message:'Identical PDF was uploaded before.', evidence:`SHA-256 matches ${duplicateHash.id}` }); }
  const duplicateNumber = db.prepare('SELECT id FROM invoices WHERE invoice_number = ? AND id <> ? LIMIT 1').get(x.invoiceNumber, currentId) as { id: string } | undefined;
  if (duplicateNumber) { score += 80; flags.push({ code:'DUPLICATE_INVOICE_NUMBER', severity:'HIGH', message:'Invoice number already exists.', evidence:`Matches ${duplicateNumber.id}` }); }

  const stats = db.prepare('SELECT COUNT(*) count, AVG(amount) avg_amount FROM invoices WHERE vendor = ? AND amount IS NOT NULL AND id <> ?').get(x.vendor, currentId) as { count:number; avg_amount:number|null };
  if (stats.count >= 3 && stats.avg_amount && x.amount > stats.avg_amount * 2) {
    score += 35; flags.push({ code:'AMOUNT_ANOMALY', severity:'HIGH', message:'Amount is more than twice the vendor historical average.', evidence:`amount=${x.amount}; average=${stats.avg_amount.toFixed(2)}; samples=${stats.count}` });
  }
  const profile = db.prepare('SELECT recipient_wallet, payment_limit FROM vendor_profiles WHERE vendor = ?').get(x.vendor) as { recipient_wallet:string; payment_limit:number|null } | undefined;
  if (profile?.recipient_wallet && x.recipientWallet.toLowerCase() !== profile.recipient_wallet.toLowerCase()) {
    score += 60; flags.push({ code:'WALLET_MISMATCH', severity:'CRITICAL', message:'Recipient wallet differs from vendor profile.', evidence:`expected=${profile.recipient_wallet}; received=${x.recipientWallet || '(missing)'}` });
  }
  if (profile?.payment_limit && x.amount > profile.payment_limit) {
    score += 35; flags.push({ code:'PAYMENT_LIMIT', severity:'HIGH', message:'Amount exceeds vendor payment limit.', evidence:`amount=${x.amount}; limit=${profile.payment_limit}` });
  }
  if (x.missingFields.length || !x.recipientWallet) {
    score += 25; flags.push({ code:'MISSING_REQUIRED_FIELDS', severity:'MEDIUM', message:'Required invoice fields are missing.', evidence:[...new Set([...x.missingFields, ...(!x.recipientWallet ? ['recipientWallet'] : [])])].join(', ') });
  }
  if (x.confidence < 0.75) {
    score += 25; flags.push({ code:'LOW_CONFIDENCE', severity:'MEDIUM', message:'AI extraction confidence is below threshold.', evidence:`confidence=${x.confidence}` });
  }
  score = Math.min(100, score);
  const decision = score >= 80 ? 'BLOCK' : score >= 40 ? 'ESCALATE' : 'APPROVE';
  return RiskResultSchema.parse({ score, decision, flags });
}
