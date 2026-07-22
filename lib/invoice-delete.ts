export const ONCHAIN_STATES = new Set(['PENDING', 'APPROVED', 'REJECTED', 'PAID']);
const LOCAL_STATUSES = new Set([
  'UPLOADED', 'EXTRACTED', 'EXTRACTION_FAILED', 'ERROR', 'BLOCK', 'BLOCKED',
  'REVIEW_REQUIRED', 'MANAGER_REVIEW',
]);

export class InvoiceNotFoundError extends Error {}
export class InvoiceDeleteConflictError extends Error {}

export type DeleteInvoiceRecord = Record<string, unknown> & { id:string; storage_path?:string | null };
export type DeleteProposalRecord = Record<string, unknown>;
export type DeleteActionRecord = Record<string, unknown>;

export interface InvoiceDeleteStore {
  getInvoice(id:string):Promise<DeleteInvoiceRecord | null>;
  getProposal(invoiceId:string):Promise<DeleteProposalRecord | null>;
  getActions(invoiceId:string):Promise<DeleteActionRecord[]>;
  deleteAudit(invoiceId:string):Promise<void>;
  deleteActions(invoiceId:string):Promise<void>;
  deleteProposal(invoiceId:string):Promise<void>;
  deleteStorage(path:string):Promise<'deleted' | 'missing'>;
  deleteInvoice(id:string):Promise<void>;
}

function upper(value:unknown) { return String(value || '').trim().toUpperCase(); }

export async function deleteLocalInvoice(id:string, store:InvoiceDeleteStore) {
  const invoice = await store.getInvoice(id);
  if (!invoice) throw new InvoiceNotFoundError('Invoice not found.');

  const [proposal, actions] = await Promise.all([store.getProposal(id), store.getActions(id)]);
  const state = upper(invoice.contract_state || invoice.approval_status);
  const status = upper(invoice.status);
  const aiStatus = upper(invoice.ai_status);
  const hasDeploy = Boolean(invoice.deploy_hash) || actions.some(action => Boolean(action.deploy_hash));
  const hasOnchainMarker = Boolean(invoice.contract_state || invoice.contract_hash || invoice.proposal_id);
  const proposalState = upper(proposal?.onchain_status || proposal?.status);

  if (proposal || hasDeploy || hasOnchainMarker || ONCHAIN_STATES.has(state) || ONCHAIN_STATES.has(status) || ONCHAIN_STATES.has(proposalState)) {
    throw new InvoiceDeleteConflictError('On-chain invoices cannot be deleted. Archive them instead.');
  }
  if (!LOCAL_STATUSES.has(status) && aiStatus !== 'ERROR') {
    throw new InvoiceDeleteConflictError('Only local test or error invoices can be deleted.');
  }

  await store.deleteAudit(id);
  if (actions.length) await store.deleteActions(id);
  if (proposal) await store.deleteProposal(id);
  const storage = invoice.storage_path ? await store.deleteStorage(String(invoice.storage_path)) : 'missing';
  await store.deleteInvoice(id);
  return { id, storage };
}
