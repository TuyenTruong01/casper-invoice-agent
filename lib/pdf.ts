import pdfParse from 'pdf-parse/lib/pdf-parse.js';

type PdfInput = Buffer | Uint8Array;
export type PdfExtractionResult = { text:string; pages:number; parser:string };

export class PdfExtractionError extends Error {
  constructor(message:string) { super(message); this.name='PdfExtractionError'; }
}

function normalizePdfText(value:string):string {
  return value.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/[\t\f\v ]+/g,' ')
    .replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

function safeError(error:unknown):string {
  const value=error instanceof Error ? error.message : String(error || 'unknown error');
  return value.replace(/[\r\n\t]+/g,' ').replace(/(?:[A-Za-z]:\\|\/)[^ ]+/g,'[path]').slice(0,180);
}

async function extractWithMuPdf(bytes:Uint8Array):Promise<PdfExtractionResult> {
  const mupdf=await import('mupdf');
  let document:ReturnType<typeof mupdf.Document.openDocument>|undefined;
  try {
    document=mupdf.Document.openDocument(bytes,'application/pdf');
    const pages=document.countPages();
    const chunks:string[]=[];
    for(let index=0;index<pages;index++){
      const page=document.loadPage(index);
      try {
        const structured=page.toStructuredText('preserve-whitespace');
        try { chunks.push(structured.asText()); } finally { structured.destroy(); }
      } finally { page.destroy(); }
    }
    const text=normalizePdfText(chunks.join('\n\n'));
    if(!text)throw new Error('PDF contains no extractable text. OCR is not implemented.');
    return { text,pages,parser:'mupdf-wasm' };
  } finally { document?.destroy(); }
}

async function extractWithPdfParse(bytes:Uint8Array):Promise<PdfExtractionResult> {
  const data=await pdfParse(Buffer.from(bytes),{ version:'v2.0.550' });
  const text=normalizePdfText(String(data.text||''));
  if(!text)throw new Error('PDF contains no extractable text. OCR is not implemented.');
  return { text,pages:Number(data.numpages||0),parser:'pdf-parse-1.1.1' };
}

export async function extractPdfText(input:PdfInput):Promise<PdfExtractionResult> {
  if(!input||input.byteLength===0)throw new PdfExtractionError('PDF input is empty.');
  const bytes=input instanceof Uint8Array ? input : new Uint8Array(input);
  let primaryError:unknown;
  try { return await extractWithMuPdf(bytes); } catch(error) { primaryError=error; }
  try { return await extractWithPdfParse(bytes); } catch(fallbackError) {
    throw new PdfExtractionError(`PDF extraction failed (mupdf-wasm: ${safeError(primaryError)}; pdf-parse-1.1.1: ${safeError(fallbackError)}).`);
  }
}
