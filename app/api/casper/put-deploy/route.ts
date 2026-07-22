import { NextRequest, NextResponse } from 'next/server';
import { appendAudit, getBlockchainAction, updateBlockchainAction, updateInvoice } from '../../../../lib/db';

const NODE_ADDRESS = process.env.CASPER_NODE_ADDRESS || process.env.NEXT_PUBLIC_CASPER_NODE_ADDRESS || 'https://node.testnet.casper.network/rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deploy = body?.deploy;
    const actionId = String(body?.actionId || '');
    if (!deploy || !actionId) return NextResponse.json({ ok:false, error:'Missing deploy JSON or actionId.' }, { status:400 });

    const action = await getBlockchainAction(actionId);
    if (!action || action.execution_status !== 'BUILT') return NextResponse.json({ ok:false, error:'Unknown or already submitted blockchain action.' }, { status:409 });
    if (deploy?.hash && action.deploy_hash && deploy.hash !== action.deploy_hash) return NextResponse.json({ ok:false, error:'Signed deploy does not match the built action.' }, { status:409 });

    const rpcBody = { jsonrpc:'2.0', id:Date.now(), method:'account_put_deploy', params:{ deploy } };
    const res = await fetch(NODE_ADDRESS, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(rpcBody), cache:'no-store',
    });
    const text = await res.text();
    let json:any;
    try { json = JSON.parse(text); } catch { json = { raw:text }; }

    if (json.error) {
      return NextResponse.json({
        ok:false,
        error:json.error.message || 'Casper RPC returned an error.',
        code:json.error.code,
        data:json.error.data,
        rpcRequestPreview:{ method:rpcBody.method, paramsShape:'object-with-deploy-field', deployHash:deploy?.hash, account:deploy?.header?.account, approvals:deploy?.approvals },
        rpc:json,
      }, { status:400 });
    }

    const deployHash = json?.result?.deploy_hash || json?.result?.value?.deploy_hash || deploy?.hash;
    const now = new Date().toISOString();
    await updateBlockchainAction(actionId, { deploy_hash:deployHash, execution_status:'SUBMITTED', updated_at:now });
    await updateInvoice(String(action.invoice_id), { deploy_hash:deployHash, execution_status:'SUBMITTED', updated_at:now });
    await appendAudit(String(action.invoice_id), String(action.proposal_id), 'CASPER_DEPLOY_SUBMITTED', String(action.caller_public_key), { actionId, action:action.action, deployHash });
    return NextResponse.json({ ok:true, rpc:json, deployHash });
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : String(error) }, { status:500 });
  }
}
