export type TimelineKind='LOCAL'|'AI'|'HUMAN'|'ON_CHAIN';
export type TimelineEvent={id:string;name:string;timestamp:string;kind:TimelineKind;actor:string|null;proposalId:string|null;deployHash:string|null;blockHeight:number|null;status:string;error:string|null};

function upper(value:unknown){return String(value||'').trim().toUpperCase()}
function details(value:unknown):Record<string,any>{
  if(value&&typeof value==='object')return value as Record<string,any>;
  try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'?parsed:{}}catch{return {}}
}
function event(id:string,name:string,timestamp:unknown,kind:TimelineKind,extra:Partial<TimelineEvent>={}):TimelineEvent{
  return {id,name,timestamp:String(timestamp||''),kind,actor:null,proposalId:null,deployHash:null,blockHeight:null,status:'COMPLETED',error:null,...extra};
}
const EVENT_ORDER=['PDF uploaded','File stored in private Supabase Storage','Text extracted','Gemini extraction completed','Risk Agent decision generated','Local proposal created','Wallet signature requested','Deploy submitted','Execution succeeded','Execution failed','Proposal approved','Proposal rejected','Payment proof anchored','Contract state readback completed','Supabase reconciliation completed'];

export function buildAuditTimeline(invoice:Record<string,any>,proposal:Record<string,any>|undefined,actions:Record<string,any>[],audit:Record<string,any>[]):TimelineEvent[]{
  const invoiceAudit=audit.filter(row=>String(row.invoice_id)===String(invoice.id));
  const riskAudit=invoiceAudit.find(row=>upper(row.event)==='RISK_ASSESSED');
  const extractionTime=riskAudit?.created_at||invoice.updated_at;
  const events:TimelineEvent[]=[];
  if(invoice.created_at&&invoice.original_name)events.push(event('invoice-uploaded','PDF uploaded',invoice.created_at,'LOCAL'));
  if(invoice.created_at&&invoice.file_hash)events.push(event('file-stored','File stored in private Supabase Storage',invoice.created_at,'LOCAL'));
  if(upper(invoice.ai_status)==='COMPLETE'){
    events.push(event('text-extracted','Text extracted',extractionTime,'LOCAL'));
    events.push(event('gemini-complete','Gemini extraction completed',extractionTime,'AI',{actor:invoice.ai_model||null}));
  }
  if(riskAudit){
    const data=details(riskAudit.details_json);
    events.push(event(`audit-${riskAudit.id}`,'Risk Agent decision generated',riskAudit.created_at,'AI',{actor:riskAudit.actor||'Risk Agent',proposalId:riskAudit.proposal_id||null,status:upper(data.decision)||'COMPLETED'}));
  }
  if(proposal?.created_at)events.push(event(`proposal-${proposal.id}`,'Local proposal created',proposal.created_at,'LOCAL',{actor:proposal.created_by||null,proposalId:String(proposal.id),status:upper(proposal.status)||'LOCAL_PENDING'}));

  const submitted=new Map<string,Record<string,any>>();
  for(const row of invoiceAudit){
    const name=upper(row.event),data=details(row.details_json);
    if(name==='CASPER_DEPLOY_SUBMITTED'&&data.actionId)submitted.set(String(data.actionId),row);
    if(!['RISK_ASSESSED','CASPER_DEPLOY_BUILT','CASPER_DEPLOY_SUBMITTED','CASPER_EXECUTION_SUCCEEDED','CASPER_EXECUTION_FAILED'].includes(name)){
      events.push(event(`audit-${row.id}`,String(row.event).replaceAll('_',' '),row.created_at,'LOCAL',{actor:row.actor||null,proposalId:row.proposal_id||null,status:'RECORDED'}));
    }
  }

  for(const action of actions.filter(row=>String(row.invoice_id)===String(invoice.id))){
    const id=String(action.id),actor=action.caller_public_key||null,proposalId=action.proposal_id||null,deployHash=action.deploy_hash||null;
    events.push(event(`action-${id}-signature`,'Wallet signature requested',action.created_at,'HUMAN',{actor,proposalId,deployHash,status:'REQUESTED'}));
    const submittedAudit=submitted.get(id);
    if(submittedAudit){
      const data=details(submittedAudit.details_json);
      events.push(event(`action-${id}-submitted`,'Deploy submitted',submittedAudit.created_at,'ON_CHAIN',{actor:submittedAudit.actor||actor,proposalId,deployHash:data.deployHash||deployHash,status:'SUBMITTED'}));
    }
    const execution=upper(action.execution_status);
    if(execution==='EXECUTED'||execution==='FAILED'){
      const succeeded=execution==='EXECUTED',timestamp=action.updated_at||action.created_at,blockHeight=action.block_height==null?null:Number(action.block_height),error=action.error_message||null;
      events.push(event(`action-${id}-execution`,succeeded?'Execution succeeded':'Execution failed',timestamp,'ON_CHAIN',{actor,proposalId,deployHash,blockHeight,status:execution,error}));
      if(succeeded){
        const actionName=upper(action.action);
        if(actionName==='APPROVE_INVOICE'||actionName==='REJECT_INVOICE')events.push(event(`action-${id}-decision`,actionName==='APPROVE_INVOICE'?'Proposal approved':'Proposal rejected',timestamp,'HUMAN',{actor,proposalId,deployHash,blockHeight,status:actionName==='APPROVE_INVOICE'?'APPROVED':'REJECTED'}));
        if(actionName==='RECORD_PAYMENT_PROOF')events.push(event(`action-${id}-proof`,'Payment proof anchored',timestamp,'ON_CHAIN',{actor,proposalId,deployHash,blockHeight,status:'PAID'}));
        events.push(event(`action-${id}-readback`,'Contract state readback completed',timestamp,'ON_CHAIN',{actor,proposalId,deployHash,blockHeight,status:'VERIFIED'}));
        events.push(event(`action-${id}-reconciled`,'Supabase reconciliation completed',timestamp,'LOCAL',{actor:null,proposalId,deployHash,blockHeight,status:'COMPLETED'}));
      }
    }
  }
  return events.filter(item=>Number.isFinite(Date.parse(item.timestamp))).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||(EVENT_ORDER.indexOf(a.name)+1||999)-(EVENT_ORDER.indexOf(b.name)+1||999)||a.id.localeCompare(b.id));
}
