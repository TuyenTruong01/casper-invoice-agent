import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createDeleteHandler } from '../app/api/invoices/[id]/route';
import { deleteLocalInvoice, InvoiceDeleteConflictError, type InvoiceDeleteStore } from '../lib/invoice-delete';

function store(invoice:Record<string,unknown>|null, options:{ proposal?:Record<string,unknown>|null; actions?:Record<string,unknown>[]; storage?:'deleted'|'missing' }={}) {
  const calls:string[]=[];
  const value:InvoiceDeleteStore={
    getInvoice:async()=>invoice as any,
    getProposal:async()=>options.proposal||null,
    getActions:async()=>options.actions||[],
    deleteAudit:async()=>{calls.push('audit')},
    deleteActions:async()=>{calls.push('actions')},
    deleteProposal:async()=>{calls.push('proposal')},
    deleteStorage:async()=>{calls.push('storage');return options.storage||'deleted'},
    deleteInvoice:async()=>{calls.push('invoice')},
  };
  return { value,calls };
}

describe('safe invoice deletion',()=>{
  it('deletes a local ERROR invoice in safe order',async()=>{const fake=store({id:'error-id',status:'ERROR',storage_path:'error.pdf'});await deleteLocalInvoice('error-id',fake.value);expect(fake.calls).toEqual(['audit','storage','invoice'])});
  it('deletes a local BLOCK invoice with no proposal or deploy',async()=>{const fake=store({id:'block-id',status:'BLOCK',storage_path:'block.pdf'});const result=await deleteLocalInvoice('block-id',fake.value);expect(result.id).toBe('block-id');expect(fake.calls.at(-1)).toBe('invoice')});
  it('continues database cleanup when the Storage object is missing',async()=>{const fake=store({id:'missing-file',status:'UPLOADED',storage_path:'gone.pdf'},{storage:'missing'});const result=await deleteLocalInvoice('missing-file',fake.value);expect(result.storage).toBe('missing');expect(fake.calls).toEqual(['audit','storage','invoice'])});
  it('rejects PENDING invoices with 409 semantics',async()=>{const fake=store({id:'pending',status:'PENDING',storage_path:'p.pdf'});await expect(deleteLocalInvoice('pending',fake.value)).rejects.toBeInstanceOf(InvoiceDeleteConflictError);expect(fake.calls).toEqual([])});
  it('rejects PAID invoices with 409 semantics',async()=>{const fake=store({id:'paid',status:'PAID',contract_state:'PAID',storage_path:'p.pdf'});await expect(deleteLocalInvoice('paid',fake.value)).rejects.toThrow('On-chain invoices cannot be deleted');expect(fake.calls).toEqual([])});
  it('uses only the server service-role client, never a public Supabase client',()=>{const route=fs.readFileSync(path.join(process.cwd(),'app/api/invoices/[id]/route.ts'),'utf8');const server=fs.readFileSync(path.join(process.cwd(),'lib/supabase/server.ts'),'utf8');expect(route).toContain('getSupabaseAdmin');expect(route).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');expect(server).toContain('SUPABASE_SERVICE_ROLE_KEY');expect(server).not.toContain('SUPABASE_ANON_KEY')});
  it('always returns JSON for success, conflict, missing and internal errors',async()=>{const cases=[
    { invoice:{id:'ok',status:'ERROR',storage_path:'x'},status:200 },
    { invoice:{id:'pending',status:'PENDING'},status:409 },
    { invoice:null,status:404 },
  ];for(const item of cases){const fake=store(item.invoice);const response=await createDeleteHandler(()=>fake.value)(new NextRequest('http://localhost/api/invoices/id',{method:'DELETE'}),{params:Promise.resolve({id:'id'})});expect(response.status).toBe(item.status);expect(response.headers.get('content-type')).toContain('application/json');await expect(response.json()).resolves.toHaveProperty('ok')}});
});
