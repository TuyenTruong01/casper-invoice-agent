import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GeminiExtractionError, GeminiInvoiceExtractor, type GeminiClient, validateAndNormalizeGeminiInvoice } from '../lib/ai/gemini-invoice-extractor';
import { getDb, getInvoice } from '../lib/db';
import { POST as analyzeInvoice } from '../app/api/invoices/analyze/route';

const validGeminiJson = JSON.stringify({
  invoiceNumber:'INV-GEMINI-1', vendorName:'Gemini Test Vendor', invoiceDate:'2026-07-01', dueDate:'2026-07-31',
  amount:125.5, currency:'USD', recipientWallet:null, confidence:0.9, missingFields:['recipientWallet'],
});

function mockClient(text: string): GeminiClient {
  return { models:{ generateContent:vi.fn().mockResolvedValue({ text, responseId:'mock-response' }) } };
}

afterEach(() => vi.unstubAllEnvs());

describe('Gemini invoice extractor', () => {
  it('fails closed without GEMINI_API_KEY', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const id = 'gemini-missing-key-test';
    const db = getDb();
    db.prepare('DELETE FROM invoices WHERE id=?').run(id);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO invoices(id,original_name,storage_path,file_hash,mime_type,size_bytes,extracted_text,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,'EXTRACTED',?,?)`).run(id,'test.pdf','test','gemini-key-hash','application/pdf',1,'Invoice text',now,now);
    const response = await analyzeInvoice(new NextRequest('http://localhost/api/invoices/analyze', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}),
    }));
    expect(response.status).toBe(503);
    const saved = getInvoice(id)!;
    expect(saved.ai_status).toBe('ERROR');
    expect(saved.invoice_number).toBeNull();
    db.prepare('DELETE FROM invoices WHERE id=?').run(id);
  });

  it('parses valid structured JSON and normalizes explicit nulls', async () => {
    const result = await new GeminiInvoiceExtractor({ client:mockClient(validGeminiJson), model:'mock-model' })
      .extractInvoice({ text:'invoice', filename:'test.pdf' });
    expect(result.vendor).toBe('Gemini Test Vendor');
    expect(result.amount).toBe(125.5);
    expect(result.recipientWallet).toBe('');
    expect(result.missingFields).toContain('recipientWallet');
  });

  it('rejects invalid schema', () => {
    expect(() => validateAndNormalizeGeminiInvoice(JSON.stringify({ invoiceNumber:'INV-1' })))
      .toThrow(GeminiExtractionError);
  });

  it('rejects string amounts', () => {
    expect(() => validateAndNormalizeGeminiInvoice(validGeminiJson.replace('125.5', '"125.5"')))
      .toThrow(GeminiExtractionError);
  });

  it('rejects missing fields and unexpected model-added fields', () => {
    const missing = JSON.parse(validGeminiJson); delete missing.vendorName;
    expect(() => validateAndNormalizeGeminiInvoice(JSON.stringify(missing))).toThrow(GeminiExtractionError);
    expect(() => validateAndNormalizeGeminiInvoice(JSON.stringify({ ...JSON.parse(validGeminiJson), riskDecision:'APPROVE' })))
      .toThrow(GeminiExtractionError);
  });

  it('has no OpenAI runtime dependency', () => {
    const packageJson = fs.readFileSync(path.join(process.cwd(),'package.json'),'utf8');
    const runtimeSources = [
      fs.readFileSync(path.join(process.cwd(),'lib/ai/gemini-invoice-extractor.ts'),'utf8'),
      fs.readFileSync(path.join(process.cwd(),'app/api/invoices/analyze/route.ts'),'utf8'),
    ].join('\n');
    expect(packageJson.toLowerCase()).not.toContain('openai');
    expect(runtimeSources.toLowerCase()).not.toContain('openai');
  });
});
