import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractPdfText } from '../lib/pdf';
import { InvoiceExtractionSchema } from '../lib/invoice-schema';
import { assessInvoiceRisk, type RiskDataSource } from '../lib/risk-agent';

const source = (overrides:Partial<RiskDataSource>={}):RiskDataSource => ({
  duplicateHash:async()=>null, duplicateNumber:async()=>null, vendorAmounts:async()=>[], vendorProfile:async()=>null, ...overrides,
});
const extraction=(recipientWallet:string|null='wallet-demo')=>InvoiceExtractionSchema.parse({
  invoiceNumber:'INV-1',vendor:'Vendor',invoiceDate:'2026-07-01',dueDate:'2026-07-31',amount:500,currency:'USD',recipientWallet,confidence:0.95,missingFields:recipientWallet?[]:['recipientWallet'],
});

describe('invoice pipeline',()=>{
  it('extracts real text from a PDF with the modern server parser',async()=>{const bytes=fs.readFileSync(path.join(process.cwd(),'tests/fixtures/text-invoice.pdf'));const result=await extractPdfText(bytes);expect(result.text).toContain('Invoice Number: TEST-INV-001');expect(result.text).toContain('Vendor: Test Vendor Ltd');expect(result.text).toContain('Recipient Wallet: account-hash-test-recipient');expect(result.pages).toBe(1);expect(result.parser).toBe('mupdf-wasm')});
  it('enforces the structured AI schema',()=>{expect(()=>InvoiceExtractionSchema.parse({invoiceNumber:'INV-1'})).toThrow();expect(extraction().currency).toBe('USD')});
  it('blocks duplicate files and wallet mismatches',async()=>{const result=await assessInvoiceRisk('current','hash',extraction('wrong'),source({duplicateHash:async()=>({id:'old'}),vendorProfile:async()=>({recipient_wallet:'expected',payment_limit:1000})}));expect(result.decision).toBe('BLOCK');expect(result.flags.map(x=>x.code)).toEqual(expect.arrayContaining(['DUPLICATE_FILE','WALLET_MISMATCH']))});
  it('auto-proposes low risk and blocks missing wallets',async()=>{expect((await assessInvoiceRisk('id','hash',extraction(),source())).decision).toBe('AUTO_PROPOSE');const blocked=await assessInvoiceRisk('id','hash',extraction(null),source());expect(blocked.decision).toBe('BLOCK');expect(blocked.flags.map(x=>x.code)).toContain('MISSING_RECIPIENT_WALLET')});
});
