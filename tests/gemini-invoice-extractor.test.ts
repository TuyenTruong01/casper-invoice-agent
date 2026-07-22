import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GeminiExtractionError, GeminiInvoiceExtractor, type GeminiClient, validateAndNormalizeGeminiInvoice } from '../lib/ai/gemini-invoice-extractor';

const validGeminiJson=JSON.stringify({invoiceNumber:'INV-GEMINI-1',vendorName:'Gemini Test Vendor',invoiceDate:'2026-07-01',dueDate:'2026-07-31',amount:125.5,currency:'USD',recipientWallet:null,confidence:0.9,missingFields:['recipientWallet']});
function mockClient(text:string):GeminiClient{return {models:{generateContent:vi.fn().mockResolvedValue({text,responseId:'mock-response'})}}}
afterEach(()=>vi.unstubAllEnvs());

describe('Gemini invoice extractor',()=>{
  it('fails closed without GEMINI_API_KEY',()=>{vi.stubEnv('GEMINI_API_KEY','');expect(()=>new GeminiInvoiceExtractor()).toThrow(GeminiExtractionError)});
  it('parses structured JSON and explicit nulls',async()=>{const result=await new GeminiInvoiceExtractor({client:mockClient(validGeminiJson),model:'mock-model'}).extractInvoice({text:'invoice',filename:'test.pdf'});expect(result.vendor).toBe('Gemini Test Vendor');expect(result.recipientWallet).toBeNull()});
  it('rejects invalid schema and string amounts',()=>{expect(()=>validateAndNormalizeGeminiInvoice(JSON.stringify({invoiceNumber:'INV-1'}))).toThrow(GeminiExtractionError);expect(()=>validateAndNormalizeGeminiInvoice(validGeminiJson.replace('125.5','"125.5"'))).toThrow(GeminiExtractionError)});
  it('rejects model-added fields',()=>{expect(()=>validateAndNormalizeGeminiInvoice(JSON.stringify({...JSON.parse(validGeminiJson),riskDecision:'APPROVE'}))).toThrow(GeminiExtractionError)});
  it('has no OpenAI runtime dependency',()=>{const packageJson=fs.readFileSync(path.join(process.cwd(),'package.json'),'utf8');const sources=fs.readFileSync(path.join(process.cwd(),'lib/ai/gemini-invoice-extractor.ts'),'utf8');expect(packageJson.toLowerCase()).not.toContain('openai');expect(sources.toLowerCase()).not.toContain('openai')});
});
