import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractPdfText } from '../lib/pdf';
import { InvoiceExtractionSchema } from '../lib/invoice-schema';
import { getDb } from '../lib/db';
import { assessInvoiceRisk } from '../lib/risk-agent';

describe('invoice pipeline', () => {
  it('extracts real text from a PDF', async () => {
    const bytes = fs.readFileSync(path.join(process.cwd(), 'public/invoices/INV-2026-001.pdf'));
    const result = await extractPdfText(bytes);
    expect(result.text).toContain('INV-2026-001');
    expect(result.text).toContain('Dell Technologies');
    expect(result.pages).toBe(1);
  });

  it('enforces the structured AI schema', () => {
    expect(() => InvoiceExtractionSchema.parse({ invoiceNumber:'INV-1' })).toThrow();
    expect(InvoiceExtractionSchema.parse({
      invoiceNumber:'INV-1', vendor:'Vendor', invoiceDate:'2026-07-01', dueDate:'2026-07-31',
      amount:100, currency:'USD', recipientWallet:'', confidence:0.8, missingFields:['recipientWallet'],
    }).currency).toBe('USD');
  });

  it('blocks duplicate files and vendor wallet mismatches', () => {
    const db = getDb();
    const now = new Date().toISOString();
    const ids = ['risk-current', 'risk-existing'];
    db.prepare('DELETE FROM invoices WHERE id IN (?, ?)').run(...ids);
    db.prepare('DELETE FROM vendor_profiles WHERE vendor = ?').run('Risk Test Vendor');
    const insert = db.prepare(`INSERT INTO invoices
      (id,original_name,storage_path,file_hash,mime_type,size_bytes,extracted_text,invoice_number,vendor,amount,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'EXTRACTED',?,?)`);
    insert.run(ids[0], 'current.pdf', 'test', 'same-hash', 'application/pdf', 1, 'text', 'INV-RISK-2', 'Risk Test Vendor', 500, now, now);
    insert.run(ids[1], 'existing.pdf', 'test', 'same-hash', 'application/pdf', 1, 'text', 'INV-RISK-1', 'Risk Test Vendor', 100, now, now);
    db.prepare('INSERT INTO vendor_profiles(vendor,recipient_wallet,payment_limit,updated_at) VALUES(?,?,?,?)')
      .run('Risk Test Vendor', 'expected-wallet', 1000, now);
    const extraction = InvoiceExtractionSchema.parse({
      invoiceNumber:'INV-RISK-2', vendor:'Risk Test Vendor', invoiceDate:'2026-07-01', dueDate:'2026-07-31',
      amount:500, currency:'USD', recipientWallet:'wrong-wallet', confidence:0.95, missingFields:[],
    });
    const result = assessInvoiceRisk(ids[0], 'same-hash', extraction);
    expect(result.decision).toBe('BLOCK');
    expect(result.flags.map(flag => flag.code)).toEqual(expect.arrayContaining(['DUPLICATE_FILE', 'WALLET_MISMATCH']));
    db.prepare('DELETE FROM invoices WHERE id IN (?, ?)').run(...ids);
    db.prepare('DELETE FROM vendor_profiles WHERE vendor = ?').run('Risk Test Vendor');
  });
});
