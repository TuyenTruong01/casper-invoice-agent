import { NextRequest, NextResponse } from 'next/server';
import { appendAudit, getBlockchainAction, getInvoice, serializeInvoice, updateBlockchainAction, updateInvoice, updateProposal } from '../../../../lib/db';
import { readContractProposal } from '../../../../lib/casper-state';

const NODE_ADDRESS = process.env.CASPER_NODE_ADDRESS || process.env.NEXT_PUBLIC_CASPER_NODE_ADDRESS || 'https://node.testnet.casper.network/rpc';
const HASH_RE = /^[a-f0-9]{64}$/i;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deployHash = String(body?.deployHash || '').trim();
    const actionId = String(body?.actionId || '').trim();
    if (!HASH_RE.test(deployHash) || !actionId) return NextResponse.json({ ok:false, error:'Valid deployHash and actionId are required.' }, { status:400 });

    const action = await getBlockchainAction(actionId, deployHash);
    if (!action) return NextResponse.json({ ok:false, error:'Blockchain action/deploy mismatch.' }, { status:404 });

    const response = await fetch(NODE_ADDRESS, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ jsonrpc:'2.0', id:Date.now(), method:'info_get_deploy', params:{ deploy_hash:deployHash, finalized_approvals:true } }),
      cache:'no-store',
    });
    const rpcText = await response.text();
    let rpc:any;
    try { rpc = JSON.parse(rpcText); } catch { return NextResponse.json({ ok:false, error:`Casper RPC returned non-JSON (HTTP ${response.status}).` }, { status:502 }); }
    if (rpc.error) return NextResponse.json({ ok:false, error:rpc.error.message }, { status:502 });

    const info = rpc?.result?.execution_info;
    const result = info?.execution_result?.Version2;
    if (!info || !result) {
      const invoice = await getInvoice(String(action.invoice_id));
      return NextResponse.json({ ok:true, pending:true, success:false, invoice:invoice ? serializeInvoice(invoice) : null });
    }

    const success = result.error_message == null;
    const now = new Date().toISOString();
    const transfers = result.transfers ?? [];
    await updateBlockchainAction(actionId, {
      execution_status:success ? 'EXECUTED' : 'FAILED',
      error_message:result.error_message,
      block_height:Number(info.block_height),
      transfers_json:JSON.stringify(transfers),
      updated_at:now,
    });

    if (success) {
      const next = action.action === 'create_invoice_proposal' ? 'PENDING'
        : action.action === 'approve_invoice' ? 'APPROVED'
        : action.action === 'reject_invoice' ? 'REJECTED'
        : action.action === 'record_payment_proof' ? 'PAID'
        : null;
      if (!next) throw new Error('Unsupported persisted blockchain action.');
      const onchain = await readContractProposal(String(action.proposal_id));
      if (onchain.status !== next) throw new Error(`Contract state reconciliation failed: expected ${next}, read ${onchain.status || 'UNKNOWN'}.`);

      await updateProposal(String(action.proposal_id), {
        onchain_status:next,
        status:next,
        contract_hash:process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH || null,
        updated_at:now,
        approved_by:onchain.fields.approved_by || null,
        payment_recorded_by:onchain.fields.payment_recorded_by || null,
        payment_proof:onchain.fields.payment_proof || null,
      });
      await updateInvoice(String(action.invoice_id), {
        status:next === 'PENDING' ? 'ONCHAIN_PENDING' : next,
        approval_status:next,
        execution_status:'EXECUTED',
        execution_error:null,
        block_height:Number(info.block_height),
        contract_state:next,
        updated_at:now,
      });
    } else {
      await updateInvoice(String(action.invoice_id), { execution_status:'FAILED', execution_error:result.error_message, updated_at:now });
    }

    await appendAudit(String(action.invoice_id), String(action.proposal_id), success ? 'CASPER_EXECUTION_SUCCEEDED' : 'CASPER_EXECUTION_FAILED', String(action.caller_public_key), {
      actionId, action:action.action, deployHash, blockHeight:info.block_height, errorMessage:result.error_message, transfers,
    });
    const invoice = await getInvoice(String(action.invoice_id));
    return NextResponse.json({ ok:true, pending:false, success, errorMessage:result.error_message, blockHeight:info.block_height, transfers, invoice:invoice ? serializeInvoice(invoice) : null });
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : String(error) }, { status:500 });
  }
}
