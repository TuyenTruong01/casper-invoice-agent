import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import path from 'node:path';
import { getInvoice, serializeInvoice } from '../../../../lib/db';
import { getInvoiceBucket, getSupabaseAdmin } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin> | undefined;
  let bucket = '';
  let storagePath = '';

  try {
    supabase = getSupabaseAdmin();
    bucket = getInvoiceBucket();
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok:false, error:'Missing PDF file.' }, { status:400 });
    if (file.type !== 'application/pdf') return NextResponse.json({ ok:false, error:'Only application/pdf is allowed.' }, { status:415 });
    if (!file.size || file.size > MAX_PDF_BYTES) return NextResponse.json({ ok:false, error:'PDF must be between 1 byte and 10 MB.' }, { status:413 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') {
      return NextResponse.json({ ok:false, error:'File signature is not PDF.' }, { status:415 });
    }

    const id = crypto.randomUUID();
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const { data: prior, error: priorError } = await supabase
      .from('invoices')
      .select('id')
      .eq('file_hash', hash)
      .limit(1)
      .maybeSingle();
    if (priorError) throw new Error(`Duplicate check failed: ${priorError.message}`);

    storagePath = `${id}/${path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const upload = await supabase.storage.from(bucket).upload(storagePath, bytes, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    });
    if (upload.error) throw new Error(`Supabase Storage upload failed: ${upload.error.message}`);

    const now = new Date().toISOString();
    const duplicateFlags = prior
      ? [{ code:'DUPLICATE_FILE', severity:'CRITICAL', message:'Identical PDF was uploaded before.', evidence:`SHA-256 matches ${prior.id}` }]
      : [];

    const { error: insertError } = await supabase.from('invoices').insert({
      id,
      original_name:path.basename(file.name),
      storage_path:storagePath,
      file_hash:hash,
      mime_type:file.type,
      size_bytes:file.size,
      extracted_text:'',
      ai_status:'PENDING',
      risk_score:prior ? 100 : null,
      risk_decision:prior ? 'BLOCK' : null,
      risk_flags:duplicateFlags,
      status:prior ? 'REVIEW_REQUIRED' : 'UPLOADED',
      created_at:now,
      updated_at:now,
    });
    if (insertError) throw new Error(`Could not persist invoice: ${insertError.message}`);

    const invoice = await getInvoice(id);
    return NextResponse.json({ ok:true, pages:null, invoice:serializeInvoice(invoice!) }, { status:201 });
  } catch (error) {
    if (storagePath && supabase && bucket) {
      try { await supabase.storage.from(bucket).remove([storagePath]); } catch { /* best-effort rollback */ }
    }
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : String(error) }, { status:500 });
  }
}
