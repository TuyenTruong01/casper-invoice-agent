import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { buildAuditTimeline } from './audit-timeline';
import { effectiveChainState } from './command-center';
import { buildRiskPresentation } from './risk-reasoning';

export type AuditReportBundle={invoice:Record<string,any>;proposal?:Record<string,any>;actions:Record<string,any>[];audit:Record<string,any>[]};
export class AuditReportIncompleteError extends Error{}

export function assertAuditReportReady(invoice:Record<string,any>){
  const missing=['invoice_number','vendor','amount','currency','file_hash'].filter(key=>invoice[key]===null||invoice[key]===undefined||invoice[key]==='');
  if(String(invoice.ai_status).toUpperCase()!=='COMPLETE')missing.push('completed extraction');
  if(!['AUTO_PROPOSE','ESCALATE','BLOCK'].includes(String(invoice.risk_decision).toUpperCase()))missing.push('Risk Agent decision');
  if(missing.length)throw new AuditReportIncompleteError(`Audit report requires: ${[...new Set(missing)].join(', ')}.`);
}

function ascii(value:unknown,max=180){
  const text=String(value??'Not persisted').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'?');
  return text.length>max?`${text.slice(0,max-3)}...`:text;
}
function transferCount(value:unknown){try{const parsed=JSON.parse(String(value||'[]'));return Array.isArray(parsed)?parsed.length:0}catch{return 0}}
function explorer(hash:unknown){return hash?`https://testnet.cspr.live/transaction/${String(hash)}`:'Not available'}

class Writer{
  doc:PDFDocument;regular:PDFFont;bold:PDFFont;page!:PDFPage;y=0;pageNumber=0;
  constructor(doc:PDFDocument,regular:PDFFont,bold:PDFFont){this.doc=doc;this.regular=regular;this.bold=bold;this.newPage()}
  newPage(){this.page=this.doc.addPage([595,842]);this.y=800;this.pageNumber++;this.page.drawRectangle({x:0,y:817,width:595,height:25,color:rgb(.04,.20,.17)});this.page.drawText('InvoiceOS  |  Casper Invoice Audit Report',{x:38,y:825,size:9,font:this.bold,color:rgb(1,1,1)});this.page.drawText(`Page ${this.pageNumber}`,{x:520,y:825,size:8,font:this.regular,color:rgb(.8,.95,.9)})}
  ensure(lines=1){if(this.y-lines*13<42)this.newPage();return true}
  heading(text:string){if(!this.ensure(2))return;this.y-=8;this.page.drawText(ascii(text,80),{x:38,y:this.y,size:14,font:this.bold,color:rgb(.03,.39,.32)});this.y-=18;this.page.drawLine({start:{x:38,y:this.y},end:{x:557,y:this.y},thickness:.7,color:rgb(.82,.88,.86)});this.y-=12}
  row(label:string,value:unknown){const width=380,size=8.5;const words=ascii(value,500).split(' ');const lines:string[]=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(this.regular.widthOfTextAtSize(next,size)>width){lines.push(line);line=word}else line=next}if(line)lines.push(line);if(!this.ensure(Math.max(1,lines.length)))return;this.page.drawText(ascii(label,28),{x:42,y:this.y,size:8.5,font:this.bold,color:rgb(.25,.31,.30)});for(const [index,text] of lines.entries())this.page.drawText(text,{x:165,y:this.y-index*11,size,font:this.regular,color:rgb(.12,.17,.16)});this.y-=Math.max(1,lines.length)*12}
  note(text:string,color=rgb(.28,.34,.33)){if(!this.ensure(3))return;const chunks=ascii(text,420).match(/.{1,95}(?:\s|$)/g)||[ascii(text,95)];this.page.drawRectangle({x:38,y:this.y-chunks.length*11-7,width:519,height:chunks.length*11+14,color:rgb(.95,.97,.96)});chunks.forEach((line,index)=>this.page.drawText(line.trim(),{x:47,y:this.y-index*11,size:8.3,font:this.regular,color}));this.y-=chunks.length*11+20}
}

export async function generateAuditReportPdf(bundle:AuditReportBundle,options:{generatedAt?:Date;network?:string;contractHash?:string}={}):Promise<Uint8Array>{
  const {invoice,proposal,actions,audit}=bundle;assertAuditReportReady(invoice);
  const generatedAt=options.generatedAt||new Date(),network=options.network||'casper-test',contractHash=options.contractHash||invoice.contract_hash||proposal?.contract_hash||'Not persisted';
  const doc=await PDFDocument.create();doc.setTitle(`InvoiceOS Audit Report ${invoice.invoice_number}`);doc.setAuthor('InvoiceOS');doc.setSubject('Casper invoice payment-proof audit evidence');
  const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),w=new Writer(doc,regular,bold);
  w.heading('Report header');w.row('Report','Casper Invoice Audit Report');w.row('Generated at',generatedAt.toISOString());w.row('Network',network);w.row('Contract hash',contractHash);
  w.heading('Invoice information');[['Invoice ID',invoice.id],['Invoice number',invoice.invoice_number],['Vendor',invoice.vendor],['Issue date',invoice.invoice_date],['Due date',invoice.due_date],['Amount',invoice.amount],['Currency',invoice.currency],['Recipient wallet',invoice.recipient_wallet||'Missing from source invoice'],['Original file',invoice.original_name],['File SHA-256',invoice.file_hash],['Storage reference',invoice.storage_path],['Extraction confidence',invoice.confidence],['PDF parser',invoice.pdf_parser||'Not persisted for legacy invoice'],['Gemini model',invoice.ai_model]].forEach(([a,b])=>w.row(String(a),b));
  const risk=buildRiskPresentation(invoice);w.heading('Risk Agent result');w.row('Decision',risk.decision);w.row('Risk score',risk.score);w.row('Missing fields',(invoice.missing_fields||[]).join(', ')||'None');risk.flags.forEach((flag,index)=>{w.row(`Flag ${index+1}`,`${flag.code} [${flag.severity}] - ${flag.message}`);w.row('Evidence',flag.evidence)});w.row('Recommendation',risk.recommendation||risk.summary);
  const approveAction=actions.find(item=>String(item.action).toLowerCase()==='approve_invoice'&&String(item.execution_status).toUpperCase()==='EXECUTED');
  const rejectAction=actions.find(item=>String(item.action).toLowerCase()==='reject_invoice'&&String(item.execution_status).toUpperCase()==='EXECUTED');
  w.heading('Proposal information');if(proposal){[['Proposal ID',proposal.id],['Invoice hash',proposal.invoice_hash],['Proposal status',effectiveChainState(invoice,proposal)||proposal.status],['Created by',proposal.created_by],['Created at',proposal.created_at],['Approved by',proposal.approved_by||approveAction?.caller_public_key],['Approved at',approveAction?.updated_at],['Rejected by',rejectAction?.caller_public_key],['Rejected at',rejectAction?.updated_at],['Payment recorded by',proposal.payment_recorded_by]].forEach(([a,b])=>w.row(String(a),b))}else w.note('This invoice has no persisted proposal and has not been submitted to Casper.');
  w.heading('Blockchain evidence');w.row('Contract hash',contractHash);w.row('Package hash','Not persisted');w.row('Network',network);w.row('Transfer count',actions.reduce((sum,item)=>sum+transferCount(item.transfers_json),0));w.row('State readback result',effectiveChainState(invoice,proposal)||'No on-chain state persisted');if(actions.length)actions.forEach((action,index)=>{w.row(`Action ${index+1}`,action.action);w.row('Deploy hash',action.deploy_hash||'Not submitted');w.row('Block height',action.block_height??'Not executed');w.row('Execution',action.execution_status);w.row('Execution error',action.error_message||'None');w.row('Explorer URL',explorer(action.deploy_hash))});else w.note('No Casper blockchain action is persisted for this invoice.');
  w.heading('Payment proof');w.row('Proof reference',proposal?.payment_proof||'Not recorded');w.row('Recorded by',proposal?.payment_recorded_by||'Not recorded');const proofAction=actions.find(item=>String(item.action).toLowerCase()==='record_payment_proof'&&String(item.execution_status).toUpperCase()==='EXECUTED');w.row('Recorded at',proofAction?.updated_at||'Not recorded');w.row('Final contract state',effectiveChainState(invoice,proposal)||'NOT_SUBMITTED');
  w.heading('Final status');const final=effectiveChainState(invoice,proposal)||'NOT_SUBMITTED';w.row('Status',final);if(final==='PAID')w.note('PAID means an approved payment-proof record was anchored on Casper. This report does not prove that the vendor received funds, and the contract does not perform token transfer, settlement, or escrow.');else if(final==='REJECTED')w.note('The proposal was rejected on Casper and cannot be approved or receive a payment-proof record.');else if(final==='NOT_SUBMITTED')w.note('This invoice has not been submitted to Casper.');
  w.heading('Audit timeline');const timeline=buildAuditTimeline(invoice,proposal,actions,audit);timeline.forEach(item=>w.row(item.kind,`${item.timestamp} | ${item.name} | ${item.status}${item.actor?` | actor=${item.actor}`:''}${item.deployHash?` | deploy=${item.deployHash}`:''}${item.blockHeight!=null?` | block=${item.blockHeight}`:''}${item.error?` | error=${item.error}`:''}`));
  w.heading('Integrity');w.row('File SHA-256',invoice.file_hash);w.row('Proposal ID',proposal?.id||'Not created');w.row('Contract hash',contractHash);w.row('Latest deploy hash',[...actions].reverse().find(item=>item.deploy_hash)?.deploy_hash||invoice.deploy_hash||'Not submitted');w.row('Report generated at',generatedAt.toISOString());w.note('This report is generated from persisted Supabase records and reconciled Casper evidence. It does not contain the private source PDF or any secret key.');
  return doc.save({useObjectStreams:false});
}
