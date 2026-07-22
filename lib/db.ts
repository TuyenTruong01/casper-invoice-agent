import { getSupabaseAdmin } from './supabase/server';

export type InvoiceRow = Record<string, any>;
export type ProposalRow = Record<string, any>;
export type BlockchainActionRow = Record<string, any>;

function assertNoError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function appendAudit(
  invoiceId: string | null,
  proposalId: string | null,
  event: string,
  actor: string | null,
  details: unknown = {},
) {
  const { error } = await getSupabaseAdmin().from('audit_history').insert({
    invoice_id: invoiceId,
    proposal_id: proposalId,
    event,
    actor,
    details_json: JSON.stringify(details),
    created_at: new Date().toISOString(),
  });
  assertNoError(error, 'Could not append audit event');
}

export async function getInvoice(id: string): Promise<InvoiceRow | undefined> {
  const { data, error } = await getSupabaseAdmin()
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  assertNoError(error, 'Could not load invoice');
  return data || undefined;
}

export function serializeInvoice(row: InvoiceRow) {
  const safe = { ...row };
  delete safe.storage_path;
  delete safe.extracted_text;
  return {
    ...safe,
    missing_fields: Array.isArray(row.missing_fields)
      ? row.missing_fields
      : JSON.parse(String(row.missing_fields || '[]')),
    risk_flags: Array.isArray(row.risk_flags)
      ? row.risk_flags
      : JSON.parse(String(row.risk_flags || '[]')),
  };
}

export async function getProposalByInvoice(invoiceId: string): Promise<ProposalRow | undefined> {
  const { data, error } = await getSupabaseAdmin()
    .from('proposals')
    .select('*')
    .eq('invoice_id', invoiceId)
    .maybeSingle();
  assertNoError(error, 'Could not load proposal');
  return data || undefined;
}

export async function getBlockchainAction(id: string, deployHash?: string) {
  let query = getSupabaseAdmin().from('blockchain_actions').select('*').eq('id', id);
  if (deployHash) query = query.eq('deploy_hash', deployHash);
  const { data, error } = await query.maybeSingle();
  assertNoError(error, 'Could not load blockchain action');
  return data || undefined;
}

export async function updateInvoice(id: string, values: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin()
    .from('invoices')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  assertNoError(error, 'Could not update invoice');
  return data;
}

export async function updateProposal(id: string, values: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin()
    .from('proposals')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  assertNoError(error, 'Could not update proposal');
  return data;
}

export async function updateBlockchainAction(id: string, values: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin()
    .from('blockchain_actions')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  assertNoError(error, 'Could not update blockchain action');
  return data;
}
