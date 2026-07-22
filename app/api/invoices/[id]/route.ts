import { NextRequest, NextResponse } from 'next/server';
import { deleteLocalInvoice, InvoiceDeleteConflictError, InvoiceNotFoundError, type InvoiceDeleteStore } from '../../../../lib/invoice-delete';
import { getInvoiceBucket, getSupabaseAdmin } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function databaseError(error:{ message:string } | null, operation:string) {
  if (error) throw new Error(`${operation} failed.`);
}

export function createSupabaseDeleteStore():InvoiceDeleteStore {
  const supabase = getSupabaseAdmin();
  return {
    async getInvoice(id) { const { data,error }=await supabase.from('invoices').select('*').eq('id',id).maybeSingle();databaseError(error,'Invoice lookup');return data; },
    async getProposal(invoiceId) { const { data,error }=await supabase.from('proposals').select('*').eq('invoice_id',invoiceId).maybeSingle();databaseError(error,'Proposal lookup');return data; },
    async getActions(invoiceId) { const { data,error }=await supabase.from('blockchain_actions').select('*').eq('invoice_id',invoiceId);databaseError(error,'Action lookup');return data || []; },
    async deleteAudit(invoiceId) { const { error }=await supabase.from('audit_history').delete().eq('invoice_id',invoiceId);databaseError(error,'Audit cleanup'); },
    async deleteActions(invoiceId) { const { error }=await supabase.from('blockchain_actions').delete().eq('invoice_id',invoiceId);databaseError(error,'Action cleanup'); },
    async deleteProposal(invoiceId) { const { error }=await supabase.from('proposals').delete().eq('invoice_id',invoiceId);databaseError(error,'Proposal cleanup'); },
    async deleteStorage(path) {
      const { error }=await supabase.storage.from(getInvoiceBucket()).remove([path]);
      if (!error) return 'deleted';
      const status=Number((error as any).statusCode || (error as any).status || 0);
      if (status===404 || /not found|does not exist|object missing/i.test(error.message)) return 'missing';
      throw new Error('Storage cleanup failed.');
    },
    async deleteInvoice(id) { const { error }=await supabase.from('invoices').delete().eq('id',id);databaseError(error,'Invoice deletion'); },
  };
}

export function createDeleteHandler(storeFactory:()=>InvoiceDeleteStore) {
  return async function DELETE(_request:NextRequest, context:{ params:Promise<{ id:string }> }) {
    try {
      const { id }=await context.params;
      const normalized=String(id || '').trim();
      if (!normalized) return NextResponse.json({ ok:false,error:'Invoice id is required.' },{ status:400 });
      const result=await deleteLocalInvoice(normalized,storeFactory());
      return NextResponse.json({ ok:true,id:result.id,storage:result.storage });
    } catch (error) {
      if (error instanceof InvoiceNotFoundError) return NextResponse.json({ ok:false,error:error.message },{ status:404 });
      if (error instanceof InvoiceDeleteConflictError) return NextResponse.json({ ok:false,error:error.message },{ status:409 });
      return NextResponse.json({ ok:false,error:error instanceof Error ? error.message : 'Could not delete invoice.' },{ status:500 });
    }
  };
}

export const DELETE=createDeleteHandler(createSupabaseDeleteStore);
