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
  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(id),
    invoice_hash TEXT NOT NULL UNIQUE,
    invoice_number_hash TEXT NOT NULL,
    vendor_hash TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    recipient_hash TEXT NOT NULL,
    risk_decision TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'LOCAL_PENDING',
    onchain_status TEXT,
    contract_hash TEXT,
    created_by TEXT,
    approved_by TEXT,
    payment_recorded_by TEXT,
    payment_proof TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS blockchain_actions (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES invoices(id),
    proposal_id TEXT NOT NULL,
    action TEXT NOT NULL,
    deploy_hash TEXT,
    execution_status TEXT NOT NULL DEFAULT 'BUILT',
    error_message TEXT,
    block_height INTEGER,
    transfers_json TEXT NOT NULL DEFAULT '[]',
    caller_public_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_blockchain_actions_invoice ON blockchain_actions(invoice_id);
  CREATE TABLE IF NOT EXISTS audit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT,
    proposal_id TEXT,
    event TEXT NOT NULL,
    actor TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
 `);
 const columns = database.prepare('PRAGMA table_info(invoices)').all() as Array<{ name:string }>;
 const names = new Set(columns.map(column => column.name));
 for (const [name, definition] of [
   ['approval_status', "TEXT NOT NULL DEFAULT 'NOT_REQUESTED'"],
   ['execution_status', "TEXT NOT NULL DEFAULT 'NOT_SUBMITTED'"],
   ['execution_error', 'TEXT'],
   ['contract_hash', 'TEXT'],
   ['contract_state', 'TEXT'],
 ] as const) {
   if (!names.has(name)) database.exec(`ALTER TABLE invoices ADD COLUMN ${name} ${definition}`);
 }
 globalForDb.invoiceDb = database;
 return database;
}

export function appendAudit(invoiceId: string | null, proposalId: string | null, event: string, actor: string | null, details: unknown = {}) {
  getDb().prepare('INSERT INTO audit_history(invoice_id,proposal_id,event,actor,details_json,created_at) VALUES(?,?,?,?,?,?)')
    .run(invoiceId, proposalId, event, actor, JSON.stringify(details), new Date().toISOString());
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
