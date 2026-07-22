export type WorkQueueKey='new'|'ready'|'review'|'blocked'|'pending'|'approved'|'completed';
export type WorkQueue={ key:WorkQueueKey;title:string;description:string;invoices:Record<string,any>[] };

const DEFINITIONS:Array<Omit<WorkQueue,'invoices'>>=[
  {key:'new',title:'New invoices',description:'Waiting for extraction or Risk Agent'},
  {key:'ready',title:'Ready to propose',description:'Eligible for a human-controlled proposal'},
  {key:'review',title:'Manager review',description:'Requires review; no Casper submission'},
  {key:'blocked',title:'Blocked',description:'Policy violation; proposal disabled'},
  {key:'pending',title:'Pending approval',description:'Open to approve or reject'},
  {key:'approved',title:'Ready to anchor',description:'Approved; payment proof not anchored'},
  {key:'completed',title:'Completed',description:'Final on-chain state'},
];

function upper(value:unknown){return String(value||'').trim().toUpperCase()}
function createdAt(invoice:Record<string,any>){const value=Date.parse(String(invoice.created_at||''));return Number.isFinite(value)?value:0}

export function effectiveChainState(invoice:Record<string,any>,proposal?:Record<string,any>):string {
  return upper(invoice.contract_state||proposal?.onchain_status||(proposal&&['PENDING','APPROVED','REJECTED','PAID'].includes(upper(proposal.status))?proposal.status:null));
}

export function commandCenterState(invoice:Record<string,any>,proposal?:Record<string,any>):WorkQueueKey|null {
  const chainState=effectiveChainState(invoice,proposal);
  if(chainState==='PAID'||chainState==='REJECTED')return 'completed';
  if(chainState==='APPROVED')return 'approved';
  if(chainState==='PENDING')return 'pending';
  const risk=upper(invoice.risk_decision);
  if(risk==='BLOCK')return 'blocked';
  if(risk==='ESCALATE')return 'review';
  if(risk==='AUTO_PROPOSE')return 'ready';
  const status=upper(invoice.status),ai=upper(invoice.ai_status);
  if(ai==='PENDING'||['UPLOADED','EXTRACTED'].includes(status))return 'new';
  return null;
}

export function buildCommandCenterQueues(invoices:Record<string,any>[],proposals:Record<string,any>[]):WorkQueue[] {
  const proposalByInvoice=new Map(proposals.map(proposal=>[String(proposal.invoice_id),proposal]));
  const sorted=[...invoices].sort((a,b)=>createdAt(b)-createdAt(a));
  return DEFINITIONS.map(definition=>({
    ...definition,
    invoices:sorted.filter(invoice=>commandCenterState(invoice,proposalByInvoice.get(String(invoice.id)))===definition.key),
  }));
}
