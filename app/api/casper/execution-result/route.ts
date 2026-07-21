import { NextRequest, NextResponse } from 'next/server';
import { getDb, getInvoice, serializeInvoice } from '../../../../lib/db';

const NODE_ADDRESS = process.env.CASPER_NODE_ADDRESS || process.env.NEXT_PUBLIC_CASPER_NODE_ADDRESS || 'https://node.testnet.casper.network/rpc';
const HASH_RE = /^[a-f0-9]{64}$/i;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deployHash = String(body?.deployHash || '').trim();
    const invoiceId = body?.invoiceId ? String(body.invoiceId) : '';
    if (!HASH_RE.test(deployHash)) return NextResponse.json({ ok:false, error:'Invalid deploy hash.' }, { status:400 });
    const rpcBody = { jsonrpc:'2.0', id:Date.now(), method:'info_get_deploy', params:{ deploy_hash:deployHash, finalized_approvals:true } };
    const response = await fetch(NODE_ADDRESS, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(rpcBody), cache:'no-store' });
    const rpc = await response.json();
    if (rpc.error) return NextResponse.json({ ok:false, error:rpc.error.message, rpc }, { status:502 });
    const info = rpc?.result?.execution_info;
    const result = info?.execution_result?.Version2;
    const pending = !info || !result;
    const success = !pending && result.error_message == null;
    if (invoiceId && success && getInvoice(invoiceId)) {
      getDb().prepare("UPDATE invoices SET status='PAID', deploy_hash=?, block_height=?, updated_at=? WHERE id=?")
        .run(deployHash, Number(info.block_height), new Date().toISOString(), invoiceId);
    }
    return NextResponse.json({ ok:true, pending, success, errorMessage:result?.error_message ?? null, blockHeight:info?.block_height ?? null, transfers:result?.transfers ?? [], invoice:invoiceId && getInvoice(invoiceId) ? serializeInvoice(getInvoice(invoiceId)!) : null });
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : String(error) }, { status:500 });
  }
}
