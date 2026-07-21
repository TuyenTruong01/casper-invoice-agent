import type { InvoiceExtraction } from '../invoice-schema';

export interface InvoiceExtractor {
  extractInvoice(input: {
    text: string;
    filename: string;
  }): Promise<InvoiceExtraction>;
}

export interface InvoiceExtractionResult {
  extraction: InvoiceExtraction;
  model: string;
  responseId?: string;
}
