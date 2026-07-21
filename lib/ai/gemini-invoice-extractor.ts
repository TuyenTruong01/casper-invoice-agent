import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { InvoiceExtractionSchema, type InvoiceExtraction } from '../invoice-schema';
import type { InvoiceExtractor, InvoiceExtractionResult } from './invoice-extractor';

export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
const REQUEST_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export const GeminiRawInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1).nullable(),
  vendorName: z.string().min(1).nullable(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  amount: z.number().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  recipientWallet: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string()),
}).strict();

export const GEMINI_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    invoiceNumber: { type: ['string', 'null'], description: 'Invoice identifier exactly as printed.' },
    vendorName: { type: ['string', 'null'], description: 'Vendor or supplier name exactly as printed.' },
    invoiceDate: { type: ['string', 'null'], format: 'date', description: 'Invoice date normalized to YYYY-MM-DD.' },
    dueDate: { type: ['string', 'null'], format: 'date', description: 'Due date normalized to YYYY-MM-DD.' },
    amount: { type: ['number', 'null'], minimum: 0, description: 'Grand total as a number without a currency symbol.' },
    currency: { type: ['string', 'null'], description: 'Three-letter ISO currency code.' },
    recipientWallet: { type: ['string', 'null'], description: 'Payment wallet only when explicitly present.' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    missingFields: { type: 'array', items: { type: 'string' } },
  },
  required: ['invoiceNumber','vendorName','invoiceDate','dueDate','amount','currency','recipientWallet','confidence','missingFields'],
} as const;

type GenerateResponse = { text?: string; responseId?: string };
export type GeminiClient = {
  models: {
    generateContent(args: unknown): Promise<GenerateResponse>;
  };
};

export class GeminiExtractionError extends Error {
  constructor(public readonly code: 'CONFIG'|'TIMEOUT'|'UPSTREAM'|'INVALID_JSON'|'INVALID_SCHEMA', message: string) {
    super(message);
    this.name = 'GeminiExtractionError';
  }
}

export function validateAndNormalizeGeminiInvoice(rawText: string): InvoiceExtraction {
  let json: unknown;
  try { json = JSON.parse(rawText); }
  catch { throw new GeminiExtractionError('INVALID_JSON', 'Gemini returned invalid JSON.'); }
  const parsed = GeminiRawInvoiceSchema.safeParse(json);
  if (!parsed.success) throw new GeminiExtractionError('INVALID_SCHEMA', 'Gemini output failed invoice schema validation.');
  const raw = parsed.data;
  const missing = new Set(raw.missingFields);
  const values = {
    invoiceNumber: raw.invoiceNumber ?? '',
    vendor: raw.vendorName ?? '',
    invoiceDate: raw.invoiceDate ?? '',
    dueDate: raw.dueDate ?? '',
    amount: raw.amount ?? 0,
    currency: raw.currency ?? '',
    recipientWallet: raw.recipientWallet ?? '',
    confidence: raw.confidence,
  };
  if (!raw.invoiceNumber) missing.add('invoiceNumber');
  if (!raw.vendorName) missing.add('vendor');
  if (!raw.invoiceDate) missing.add('invoiceDate');
  if (!raw.dueDate) missing.add('dueDate');
  if (raw.amount == null) missing.add('amount');
  if (!raw.currency) missing.add('currency');
  if (!raw.recipientWallet) missing.add('recipientWallet');
  return InvoiceExtractionSchema.parse({ ...values, missingFields:[...missing] });
}

function safeUpstreamError(error: unknown) {
  if (error instanceof GeminiExtractionError) return error;
  if (error instanceof Error && error.name === 'AbortError') return new GeminiExtractionError('TIMEOUT', 'Gemini request timed out.');
  return new GeminiExtractionError('UPSTREAM', 'Gemini request failed.');
}

function statusOf(error: unknown) {
  if (error instanceof ApiError) return error.status;
  if (typeof error === 'object' && error && 'status' in error && typeof error.status === 'number') return error.status;
  return undefined;
}

export class GeminiInvoiceExtractor implements InvoiceExtractor {
  private readonly client: GeminiClient;
  readonly model: string;

  constructor(options: { client?: GeminiClient; apiKey?: string; model?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey && !options.client) throw new GeminiExtractionError('CONFIG', 'GEMINI_API_KEY is not configured.');
    this.client = options.client ?? new GoogleGenAI({ apiKey }) as GeminiClient;
    this.model = options.model?.trim() || GEMINI_MODEL;
  }

  async extractInvoice(input: { text:string; filename:string }): Promise<InvoiceExtraction> {
    return (await this.extractWithMetadata(input)).extraction;
  }

  async extractWithMetadata(input: { text:string; filename:string }): Promise<InvoiceExtractionResult> {
    const prompt = `Extract invoice fields from the document text below.\n\nRules:\n- Extract only facts explicitly present in the document; never guess.\n- Return null for fields that are absent.\n- amount must be a JSON number without currency symbols.\n- Normalize dates to YYYY-MM-DD when possible; otherwise return null.\n- confidence must be between 0 and 1.\n- Never invent a recipient wallet.\n- Do not calculate or return any risk score or decision; the independent Risk Agent does that.\n- List absent fields in missingFields.\n\nFilename: ${input.filename}\n\nDocument text:\n${input.text.slice(0, 60_000)}`;
    let lastError: unknown;
    for (let attempt=0; attempt<2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseJsonSchema: GEMINI_RESPONSE_JSON_SCHEMA,
            httpOptions: { timeout: REQUEST_TIMEOUT_MS },
            abortSignal: controller.signal,
          },
        });
        if (!response.text) throw new GeminiExtractionError('INVALID_JSON', 'Gemini returned an empty response.');
        return { extraction:validateAndNormalizeGeminiInvoice(response.text), model:this.model, responseId:response.responseId };
      } catch (error) {
        lastError = error;
        const status = statusOf(error);
        if (attempt === 0 && status != null && RETRYABLE_STATUS.has(status)) continue;
        throw safeUpstreamError(error);
      } finally { clearTimeout(timer); }
    }
    throw safeUpstreamError(lastError);
  }
}
