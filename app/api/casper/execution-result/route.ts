import { NextRequest, NextResponse } from 'next/server';
import { appendAudit, getDb, getInvoice, serializeInvoice } from '../../../../lib/db';

const NODE_ADDRESS = process.env.CASPER_NODE_ADDRESS || process.env.NEXT_PUBLIC_CASPER_NODE_ADDRESS || 'https://node.testnet.casper.network/rpc';
const HASH_RE = /^[a-f0-9]{64}$/i;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deployHash = String(body?.deployHash || '').trim();
    const actionId = String(body?.actionId || '').trim();
    if (!HASH_RE.test(deployHash) || !actionId) return NextResponse.json({ ok:false, error:'Valid deployHash and actionId are required.' }, { status:400 });
    const action = getDb().prepare('SELECT * FROM blockchain_actions WHERE id=? AND deploy_hash=?').get(actionId, deployHash) as Record<string,string|number|null> | undefined;
    if (!action) return NextResponse.json({ ok:false, error:'Blockchain action/deploy mismatch.' }, { status:404 });
    const response = await fetch(NODE_ADDRESS, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ jsonrpc:'2.0', id:Date.now(), method:'info_get_deploy', params:{ deploy_hash:deployHash, finalized_approvals:true } }), cache:'no-store' });
    const rpc = await response.json();
    if (rpc.error) return NextResponse.json({ ok:false, error:rpc.error.message }, { status:502 });
    const info = rpc?.result?.execution_info;
    const result = info?.execution_result?.Version2;
    if (!info || !result) return NextResponse.json({ ok:true, pending:true, success:false, invoice:serializeInvoice(getInvoice(String(action.invoice_id))!) });
    const success = result.error_message == null;
    const now = new Date().toISOString();
    const transfers = result.transfers ?? [];
    getDb().prepare('UPDATE blockchain_actions SET execution_status=?,error_message=?,block_height=?,transfers_json=?,updated_at=? WHERE id=?')
      .run(success ? 'EXECUTED' : 'FAILED', result.error_message, Number(info.block_height), JSON.stringify(transfers), now, actionId);
    if (success) {
      const next = action.action === 'create_invoice_proposal' ? 'PENDING' : action.action === 'approve_invoice' ? 'APPROVED' : action.action === 'reject_invoice' ? 'REJECTED' : action.action === 'record_payment_proof' ? 'PAID' : null;
      if (!next) throw new Error('Unsupported persisted blockchain action.');
      getDb().prepare('UPDATE proposals SET onchain_status=?,status=?,contract_hash=?,updated_at=? WHERE id=?')
        .run(next, next, process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH || null, now, action.proposal_id);
      const invoiceStatus = next === 'PENDING' ? 'ONCHAIN_PENDING' : next;
      getDb().prepare('UPDATE invoices SET status=?,approval_status=?,execution_status=?,execution_error=NULL,block_height=?,contract_state=?,updated_at=? WHERE id=?')
        .run(invoiceStatus, next, 'EXECUTED', Number(info.block_height), next, now, action.invoice_id);
    } else {
      getDb().prepare("UPDATE invoices SET execution_status='FAILED',execution_error=?,updated_at=? WHERE id=?").run(result.error_message, now, action.invoice_id);
    }
    appendAudit(String(action.invoice_id), String(action.proposal_id), success ? 'CASPER_EXECUTION_SUCCEEDED' : 'CASPER_EXECUTION_FAILED', String(action.caller_public_key), { actionId, action:action.action, deployHash, blockHeight:info.block_height, errorMessage:result.error_message, transfers });
    return NextResponse.json({ ok:true, pending:false, success, errorMessage:result.error_message, blockHeight:info.block_height, transfers, invoice:serializeInvoice(getInvoice(String(action.invoice_id))!) });
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : String(error) }, { status:500 });
  }
}
