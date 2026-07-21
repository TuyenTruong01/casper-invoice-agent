import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { GeminiExtractionError, GeminiInvoiceExtractor } from '../../../../lib/ai/gemini-invoice-extractor';
import { appendAudit, getDb, getInvoice, serializeInvoice } from '../../../../lib/db';
import { assessInvoiceRisk } from '../../../../lib/risk-agent';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || '');
  const row = getInvoice(id);
  if (!row) return NextResponse.json({ ok:false, error:'Invoice not found.' }, { status:404 });
  try {
    const ai = await new GeminiInvoiceExtractor().extractWithMetadata({ text:String(row.extracted_text), filename:String(row.original_name) });
    const risk = assessInvoiceRisk(id, String(row.file_hash), ai.extraction);
    const x = ai.extraction;
    const db = getDb();
    const status = risk.decision === 'AUTO_PROPOSE' ? 'PROPOSAL_READY' : risk.decision === 'ESCALATE' ? 'MANAGER_REVIEW' : 'BLOCKED';
    const proposalId = risk.decision === 'AUTO_PROPOSE' ? `PROP-${id}` : null;
    db.exec('BEGIN IMMEDIATE');
    try {
    db.prepare(`UPDATE invoices SET invoice_number=?, vendor=?, invoice_date=?, due_date=?, amount=?, currency=?,
      recipient_wallet=?, confidence=?, missing_fields=?, ai_model=?, ai_status='COMPLETE', ai_error=NULL,
      risk_score=?, risk_decision=?, risk_flags=?, status=?, proposal_id=?, approval_status=?, updated_at=? WHERE id=?`)
      .run(x.invoiceNumber, x.vendor, x.invoiceDate, x.dueDate, x.amount, x.currency, x.recipientWallet,
        x.confidence, JSON.stringify(x.missingFields), ai.model, risk.score, risk.decision, JSON.stringify(risk.flags),
        status, proposalId, risk.decision === 'AUTO_PROPOSE' ? 'PENDING' : 'NOT_REQUESTED', new Date().toISOString(), id);
    if (proposalId && x.recipientWallet) {
      const hash = (value:string) => crypto.createHash('sha256').update(value).digest('hex');
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO proposals(id,invoice_id,invoice_hash,invoice_number_hash,vendor_hash,amount,currency,recipient_hash,risk_decision,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,'LOCAL_PENDING',?,?)
        ON CONFLICT(invoice_id) DO NOTHING`)
        .run(proposalId, id, String(row.file_hash), hash(x.invoiceNumber), hash(x.vendor), x.amount, x.currency.toUpperCase(), hash(x.recipientWallet), risk.decision, now, now);
    }
    appendAudit(id, proposalId, 'RISK_ASSESSED', null, { score:risk.score, decision:risk.decision, flags:risk.flags });
    db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return NextResponse.json({ ok:true, responseId:ai.responseId, invoice:serializeInvoice(getInvoice(id)!) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getDb().prepare("UPDATE invoices SET ai_status='ERROR', ai_error=?, updated_at=? WHERE id=?").run(message, new Date().toISOString(), id);
    const status = error instanceof GeminiExtractionError
      ? error.code === 'CONFIG' ? 503 : error.code === 'UPSTREAM' || error.code === 'TIMEOUT' ? 502 : 422
      : 500;
    return NextResponse.json({ ok:false, error:message, invoice:serializeInvoice(getInvoice(id)!) }, { status });
  }
}
