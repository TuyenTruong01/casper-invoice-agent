import { NextResponse } from 'next/server';
import { getDb, InvoiceRow, serializeInvoice } from '../../../lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const rows = getDb().prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 200').all() as InvoiceRow[];
  return NextResponse.json({ ok:true, invoices:rows.map(serializeInvoice) });
}
