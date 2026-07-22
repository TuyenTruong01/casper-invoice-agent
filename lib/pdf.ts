import pdfParse from 'pdf-parse/lib/pdf-parse.js';

type PdfInput = Buffer | Uint8Array;

function normalizePdfText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractPdfText(input: PdfInput): Promise<{ text: string; pages: number }> {
  if (!input || input.byteLength === 0) throw new Error('PDF input is empty.');

  let data: { text?: string; numpages?: number };
  try {
    data = await pdfParse(Buffer.isBuffer(input) ? input : Buffer.from(input), {
      // pdf-parse 1.1.1 bundles this server-side engine; it has no browser worker.
      version:'v2.0.550',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown parser error';
    throw new Error(`PDF text extraction failed: ${detail}`);
  }
  const text = normalizePdfText(String(data.text || ''));
  if (!text) throw new Error('PDF contains no extractable text. OCR is not implemented.');

  return { text, pages:Number(data.numpages || 0) };
}
