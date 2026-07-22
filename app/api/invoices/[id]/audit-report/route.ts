import { NextRequest, NextResponse } from 'next/server';
import { AuditReportIncompleteError, generateAuditReportPdf, type AuditReportBundle } from '../../../../../lib/audit-report';
import { getSupabaseAdmin } from '../../../../../lib/supabase/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export interface AuditReportStore{load(invoiceId:string):Promise<AuditReportBundle|null>}
function serverStore():AuditReportStore{return {async load(invoiceId){
  const supabase=getSupabaseAdmin();
  const [invoiceResult,proposalResult,actionsResult,auditResult]=await Promise.all([
    supabase.from('invoices').select('*').eq('id',invoiceId).maybeSingle(),
    supabase.from('proposals').select('*').eq('invoice_id',invoiceId).maybeSingle(),
    supabase.from('blockchain_actions').select('*').eq('invoice_id',invoiceId).order('created_at',{ascending:true}),
    supabase.from('audit_history').select('*').eq('invoice_id',invoiceId).order('created_at',{ascending:true}),
  ]);
  for(const result of [invoiceResult,proposalResult,actionsResult,auditResult])if(result.error)throw new Error('Could not load persisted audit evidence.');
  if(!invoiceResult.data)return null;
  return {invoice:invoiceResult.data,proposal:proposalResult.data||undefined,actions:actionsResult.data||[],audit:auditResult.data||[]};
}}}

export function createAuditReportHandler(storeFactory:()=>AuditReportStore=serverStore){return async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const id=String((await params).id||'').trim();
    const bundle=await storeFactory().load(id);
    if(!bundle)return NextResponse.json({ok:false,error:'Invoice not found.'},{status:404});
    const pdf=await generateAuditReportPdf(bundle,{network:process.env.NEXT_PUBLIC_CASPER_NETWORK||'casper-test',contractHash:process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH||bundle.invoice.contract_hash});
    const invoiceNumber=String(bundle.invoice.invoice_number||id).replace(/[^a-zA-Z0-9._-]/g,'_');
    return new NextResponse(Buffer.from(pdf),{status:200,headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="audit-report-${invoiceNumber}.pdf"`,'Cache-Control':'private, no-store'}});
  }catch(error){
    if(error instanceof AuditReportIncompleteError)return NextResponse.json({ok:false,error:error.message},{status:409});
    return NextResponse.json({ok:false,error:'Could not generate audit report.'},{status:500});
  }
}}

export const GET=createAuditReportHandler();
