import { NextResponse } from 'next/server';
import { getDb, InvoiceRow, serializeInvoice } from '../../../lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 200').all() as InvoiceRow[];
  const proposals = db.prepare('SELECT * FROM proposals ORDER BY created_at DESC LIMIT 200').all();
  const actions = db.prepare('SELECT * FROM blockchain_actions ORDER BY created_at DESC LIMIT 300').all();
  const audit = db.prepare('SELECT * FROM audit_history ORDER BY id DESC LIMIT 300').all();
  return NextResponse.json({ ok:true, invoices:rows.map(serializeInvoice), proposals, actions, audit });
}
