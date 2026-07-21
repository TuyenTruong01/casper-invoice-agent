import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const globalForDb = globalThis as unknown as { invoiceDb?: DatabaseSync };
export function getDb() {
 if (globalForDb.invoiceDb) return globalForDb.invoiceDb;
 const dataDir = path.join(process.cwd(), 'data', 'runtime');
 fs.mkdirSync(dataDir, { recursive: true });
 const database = new DatabaseSync(path.join(dataDir, 'invoices.sqlite'));
 database.exec(`
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    extracted_text TEXT NOT NULL,
    invoice_number TEXT,
    vendor TEXT,
    invoice_date TEXT,
    due_date TEXT,
    amount REAL,
    currency TEXT,
    recipient_wallet TEXT,
    confidence REAL,
    missing_fields TEXT NOT NULL DEFAULT '[]',
    ai_model TEXT,
    ai_status TEXT NOT NULL DEFAULT 'PENDING',
    ai_error TEXT,
    risk_score INTEGER,
    risk_decision TEXT,
    risk_flags TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'UPLOADED',
    proposal_id TEXT,
    deploy_hash TEXT,
    block_height INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
  CREATE INDEX IF NOT EXISTS idx_invoices_hash ON invoices(file_hash);
  CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices(vendor);
  CREATE TABLE IF NOT EXISTS vendor_profiles (
    vendor TEXT PRIMARY KEY,
    recipient_wallet TEXT NOT NULL,
    payment_limit REAL,
    updated_at TEXT NOT NULL
  );
 `);
 globalForDb.invoiceDb = database;
 return database;
}

export type InvoiceRow = Record<string, string | number | null>;

export function getInvoice(id: string) {
  return getDb().prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRow | undefined;
}

export function serializeInvoice(row: InvoiceRow) {
  const safe = { ...row };
  delete safe.storage_path;
  delete safe.extracted_text;
  return {
    ...safe,
    missing_fields: JSON.parse(String(row.missing_fields || '[]')),
    risk_flags: JSON.parse(String(row.risk_flags || '[]')),
  };
}
