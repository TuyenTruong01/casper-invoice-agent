import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { GeminiExtractionError, GeminiInvoiceExtractor } from '../../../../lib/ai/gemini-invoice-extractor';
import { appendAudit, getInvoice, serializeInvoice, updateInvoice } from '../../../../lib/db';
import { assessInvoiceRisk } from '../../../../lib/risk-agent';
import { getInvoiceBucket, getSupabaseAdmin } from '../../../../lib/supabase/server';
import { extractPdfText, PdfExtractionError } from '../../../../lib/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let id = '';
  try {
    const body = await req.json().catch(() => ({}));
    id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ ok:false, error:'Invoice id is required.' }, { status:400 });
    const row = await getInvoice(id);
    if (!row) return NextResponse.json({ ok:false, error:'Invoice not found.' }, { status:404 });

    const supabase = getSupabaseAdmin();
    const { data:object, error:downloadError } = await supabase.storage.from(getInvoiceBucket()).download(String(row.storage_path));
    if (downloadError || !object) throw new Error(`Could not download private invoice PDF: ${downloadError?.message || 'object missing'}`);
    const extracted = await extractPdfText(new Uint8Array(await object.arrayBuffer()));
    const ai = await new GeminiInvoiceExtractor().extractWithMetadata({ text:extracted.text, filename:String(row.original_name) });
    const risk = await assessInvoiceRisk(id, String(row.file_hash), ai.extraction);
    const x = ai.extraction;
    const status = risk.decision === 'AUTO_PROPOSE' ? 'PROPOSAL_READY' : risk.decision === 'ESCALATE' ? 'MANAGER_REVIEW' : 'BLOCKED';
    const proposalId = risk.decision === 'AUTO_PROPOSE' ? `PROP-${id}` : null;
    const now = new Date().toISOString();

    await updateInvoice(id, {
      invoice_number:x.invoiceNumber,
      vendor:x.vendor,
      invoice_date:x.invoiceDate,
      due_date:x.dueDate,
      amount:x.amount,
      currency:x.currency,
      recipient_wallet:x.recipientWallet,
      confidence:x.confidence,
      missing_fields:x.missingFields,
      ai_model:ai.model,
      pdf_parser:extracted.parser,
      ai_status:'COMPLETE',
      ai_error:null,
      extracted_text:extracted.text,
      risk_score:risk.score,
      risk_decision:risk.decision,
      risk_flags:risk.flags,
      status,
      proposal_id:proposalId,
      approval_status:risk.decision === 'AUTO_PROPOSE' ? 'PENDING' : 'NOT_REQUESTED',
      updated_at:now,
    });

    if (proposalId && x.recipientWallet) {
      const hash = (value:string) => crypto.createHash('sha256').update(value).digest('hex');
      const { error } = await getSupabaseAdmin().from('proposals').upsert({
        id:proposalId,
        invoice_id:id,
        invoice_hash:String(row.file_hash),
        invoice_number_hash:hash(x.invoiceNumber),
        vendor_hash:hash(x.vendor),
        amount:Math.round(x.amount),
        currency:x.currency.toUpperCase(),
        recipient_hash:hash(x.recipientWallet),
        risk_decision:risk.decision,
        status:'LOCAL_PENDING',
        created_at:now,
        updated_at:now,
      }, { onConflict:'invoice_id', ignoreDuplicates:true });
      if (error) throw new Error(`Could not create proposal: ${error.message}`);
    }

    await appendAudit(id, proposalId, 'RISK_ASSESSED', null, { score:risk.score, decision:risk.decision, flags:risk.flags });
    return NextResponse.json({ ok:true, pages:extracted.pages, parser:extracted.parser, responseId:ai.responseId, invoice:serializeInvoice((await getInvoice(id))!) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (id) {
      try { await updateInvoice(id, {
        ai_status:'ERROR', ai_error:message, updated_at:new Date().toISOString(),
        ...(error instanceof PdfExtractionError ? {
          extracted_text:'',risk_decision:null,risk_score:null,risk_flags:[],status:'EXTRACTION_FAILED',proposal_id:null,approval_status:'NOT_REQUESTED',
        } : {}),
      }); } catch { /* preserve original error */ }
    }
    const status = error instanceof PdfExtractionError ? 422 : error instanceof GeminiExtractionError
      ? error.code === 'CONFIG' ? 503 : error.code === 'UPSTREAM' || error.code === 'TIMEOUT' ? 502 : 422
      : 500;
    let invoice = null;
    if (id) { try { const saved = await getInvoice(id); invoice = saved ? serializeInvoice(saved) : null; } catch { /* JSON response still wins */ } }
    return NextResponse.json({ ok:false, error:message, invoice }, { status });
  }
}
