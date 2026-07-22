import { describe,expect,it } from 'vitest';
import { NextRequest } from 'next/server';
import { createAuditReportHandler, type AuditReportStore } from '../app/api/invoices/[id]/audit-report/route';

const pdfParse=require('pdf-parse');
const hash='a'.repeat(64),deploy='d'.repeat(64),contract='c'.repeat(64);
function bundle(){return {
  invoice:{id:'inv-1',invoice_number:'VALID-2026-001',vendor:'Test Vendor',amount:1250,currency:'USD',file_hash:hash,original_name:'invoice.pdf',storage_path:'inv-1/invoice.pdf',ai_status:'COMPLETE',ai_model:'gemini-test',pdf_parser:'mupdf',risk_decision:'AUTO_PROPOSE',risk_score:0,risk_flags:[],missing_fields:[],contract_state:'PAID',contract_hash:contract,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:10:00Z'},
  proposal:{id:'PROP-inv-1',invoice_id:'inv-1',invoice_hash:hash,status:'PAID',onchain_status:'PAID',payment_proof:'proof-1',payment_recorded_by:'02executor',created_at:'2026-01-01T00:02:00Z'},
  actions:[{id:'act-1',invoice_id:'inv-1',proposal_id:'PROP-inv-1',action:'record_payment_proof',deploy_hash:deploy,execution_status:'EXECUTED',block_height:12345,transfers_json:'[]',caller_public_key:'02executor',created_at:'2026-01-01T00:05:00Z',updated_at:'2026-01-01T00:06:00Z'}],audit:[],
}}
function handler(value:ReturnType<typeof bundle>|null){const store:AuditReportStore={load:async()=>value};return createAuditReportHandler(()=>store)}
function request(id='inv-1'){return [new NextRequest(`http://localhost/api/invoices/${id}/audit-report`),{params:Promise.resolve({id})}] as const}

describe('audit report API',()=>{
  it('returns 404 JSON for an unknown invoice',async()=>{const response=await handler(null)(...request('missing'));expect(response.status).toBe(404);expect(response.headers.get('content-type')).toContain('application/json');expect(await response.json()).toMatchObject({ok:false})});
  it('returns 409 JSON when extraction and risk evidence are incomplete',async()=>{const value=bundle();value.invoice.ai_status='PENDING';value.invoice.risk_decision=null as any;const response=await handler(value)(...request());expect(response.status).toBe(409);expect(response.headers.get('content-type')).toContain('application/json')});
  it('returns a server-generated PDF containing persisted audit evidence and the exact PAID disclaimer',async()=>{const response=await handler(bundle())(...request());expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('application/pdf');expect(response.headers.get('content-disposition')).toContain('audit-report-VALID-2026-001.pdf');const parsed=await pdfParse(Buffer.from(await response.arrayBuffer()));expect(parsed.numpages).toBeGreaterThanOrEqual(2);expect(parsed.numpages).toBeLessThanOrEqual(4);for(const expected of ['VALID-2026-001','AUTO_PROPOSE','PROP-inv-1',deploy,'12345',contract,'PAID','PAID means an approved payment-proof record was anchored on Casper.'])expect(parsed.text).toContain(expected);expect(parsed.text).not.toContain('SUPABASE_SERVICE_ROLE_KEY')});
  it('is GET-only and accepts no frontend financial or blockchain fields',()=>{expect(createAuditReportHandler.toString()).not.toContain('request.json');expect(createAuditReportHandler.toString()).not.toContain('request.body')});
});
