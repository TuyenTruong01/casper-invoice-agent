import { NextRequest, NextResponse } from 'next/server';

const NODE_ADDRESS =
  process.env.NEXT_PUBLIC_CASPER_NODE_ADDRESS ||
  'https://node.testnet.casper.network/rpc';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deploy = body?.deploy;

    if (!deploy) {
      return NextResponse.json(
        { ok: false, error: 'Missing deploy JSON.' },
        { status: 400 }
      );
    }

    const rpcBody = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'account_put_deploy',
      params: {
        deploy,
      },
    };

    const res = await fetch(NODE_ADDRESS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcBody),
      cache: 'no-store',
    });

    const text = await res.text();

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (json.error) {
      return NextResponse.json(
        {
          ok: false,
          error: json.error.message || 'Casper RPC returned an error.',
          code: json.error.code,
          data: json.error.data,
          rpcRequestPreview: {
            method: rpcBody.method,
            paramsShape: 'object-with-deploy-field',
            deployHash: deploy?.hash,
            account: deploy?.header?.account,
            approvals: deploy?.approvals,
          },
          rpc: json,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      rpc: json,
      deployHash:
        json?.result?.deploy_hash ||
        json?.result?.value?.deploy_hash ||
        deploy?.hash,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}