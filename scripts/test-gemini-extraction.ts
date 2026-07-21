import { loadEnvConfig } from '@next/env';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import { GeminiInvoiceExtractor, GEMINI_MODEL } from '../lib/ai/gemini-invoice-extractor';
import { extractPdfText } from '../lib/pdf';

loadEnvConfig(process.cwd());

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  const ai = new GoogleGenAI({ apiKey });
  const available = new Set<string>();
  const pager = await ai.models.list({ config:{ pageSize:100 } });
  for await (const item of pager) {
    if (item.name) available.add(item.name.replace(/^models\//, ''));
  }
  if (!available.has(GEMINI_MODEL)) throw new Error(`Configured model is not available to this API key: ${GEMINI_MODEL}`);
  const pdfPath = path.join(process.cwd(), 'public', 'invoices', 'INV-2026-001.pdf');
  const parsed = await extractPdfText(fs.readFileSync(pdfPath));
  const result = await new GeminiInvoiceExtractor({ apiKey, model:GEMINI_MODEL }).extractWithMetadata({
    text:parsed.text,
    filename:path.basename(pdfPath),
  });
  console.log(`Model: ${result.model}`);
  console.log(JSON.stringify(result.extraction, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
