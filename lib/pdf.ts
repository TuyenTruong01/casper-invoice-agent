import { PDFParse } from 'pdf-parse';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function extractPdfText(bytes: Uint8Array) {
  PDFParse.setWorker(pathToFileURL(path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')).href);
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    if (!text) throw new Error('PDF contains no extractable text. OCR is not configured.');
    return { text, pages: result.pages.length };
  } finally {
    await parser.destroy();
  }
}
