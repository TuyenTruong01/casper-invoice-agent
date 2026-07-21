import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb, getInvoice, serializeInvoice } from '../../../../lib/db';
import { extractPdfText } from '../../../../lib/pdf';

export const runtime = 'nodejs';
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let storagePath = '';
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok:false, error:'Missing PDF file.' }, { status:400 });
    if (file.type !== 'application/pdf') return NextResponse.json({ ok:false, error:'Only application/pdf is allowed.' }, { status:415 });
    if (!file.size || file.size > MAX_PDF_BYTES) return NextResponse.json({ ok:false, error:'PDF must be between 1 byte and 10 MB.' }, { status:413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') return NextResponse.json({ ok:false, error:'File signature is not PDF.' }, { status:415 });

    const id = crypto.randomUUID();
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const prior = getDb().prepare('SELECT id FROM invoices WHERE file_hash = ? LIMIT 1').get(hash) as { id:string } | undefined;
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    await fs.mkdir(uploadDir, { recursive:true });
    storagePath = path.join(uploadDir, `${id}.pdf`);
    await fs.writeFile(storagePath, bytes, { flag:'wx' });
    const extracted = await extractPdfText(bytes);
    const now = new Date().toISOString();
    const duplicateFlags = prior ? JSON.stringify([{ code:'DUPLICATE_FILE', severity:'CRITICAL', message:'Identical PDF was uploaded before.', evidence:`SHA-256 matches ${prior.id}` }]) : '[]';
    getDb().prepare(`INSERT INTO invoices
      (id, original_name, storage_path, file_hash, mime_type, size_bytes, extracted_text, risk_score, risk_decision, risk_flags, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, path.basename(file.name), storagePath, hash, file.type, file.size, extracted.text,
        prior ? 100 : null, prior ? 'BLOCK' : null, duplicateFlags, prior ? 'REVIEW_REQUIRED' : 'EXTRACTED', now, now);
    return NextResponse.json({ ok:true, pages:extracted.pages, invoice:serializeInvoice(getInvoice(id)!) }, { status:201 });
  } catch (error) {
    if (storagePath) await fs.unlink(storagePath).catch(() => undefined);
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : String(error) }, { status:500 });
  }
}
