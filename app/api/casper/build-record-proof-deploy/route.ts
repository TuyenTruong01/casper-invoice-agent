import { NextRequest, NextResponse } from 'next/server';

const {
  Args,
  PublicKey,
  CLValue,
  DeployHeader,
  Deploy,
  ExecutableDeployItem,
  StoredContractByName,
  Timestamp,
  Duration,
} = require('casper-js-sdk');

const CHAIN_NAME = process.env.NEXT_PUBLIC_CASPER_NETWORK || 'casper-test';
const NAMED_KEY =
  process.env.NEXT_PUBLIC_CASPER_NAMED_KEY ||
  'invoice_payment_proof_contract_v2';

const PAYMENT_AMOUNT = '20000000000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const accountPublicKey = String(body?.accountPublicKey || '').trim();
    const proposalId = String(body?.proposalId || `proposal-web-${Date.now()}`);
    const proofHash = String(body?.proofHash || `proof-web-${Date.now()}`);
    const entryPoint = String(body?.entryPoint || 'record_payment_proof');

    if (!accountPublicKey) {
      return NextResponse.json(
        { ok: false, error: 'Missing accountPublicKey.' },
        { status: 400 }
      );
    }

    const account = PublicKey.fromHex(accountPublicKey);

    const runtimeArgs = Args.fromMap({});
    runtimeArgs.insert('proposal_id', CLValue.newCLString(proposalId));
    if (entryPoint === 'create_invoice_proposal') {
      runtimeArgs.insert('invoice_hash', CLValue.newCLString(String(body?.invoiceHash || '')));
      runtimeArgs.insert('invoice_number_hash', CLValue.newCLString(String(body?.invoiceNumberHash || '')));
      runtimeArgs.insert('vendor_hash', CLValue.newCLString(String(body?.vendorHash || '')));
      runtimeArgs.insert('amount', CLValue.newCLUint64(String(body?.amount || '0')));
      runtimeArgs.insert('currency', CLValue.newCLString(String(body?.currency || '')));
      runtimeArgs.insert('recipient_hash', CLValue.newCLString(String(body?.recipientHash || '')));
    } else if (entryPoint === 'record_payment_proof') {
      runtimeArgs.insert('payment_proof', CLValue.newCLString(proofHash));
    } else if (entryPoint !== 'approve_invoice' && entryPoint !== 'reject_invoice' && entryPoint !== 'get_invoice_proposal') {
      return NextResponse.json({ ok:false, error:'Unsupported contract entry point.' }, { status:400 });
    }

    const session = new ExecutableDeployItem();
    session.storedContractByName = new StoredContractByName(
      NAMED_KEY,
      entryPoint,
      runtimeArgs
    );

    const payment = ExecutableDeployItem.standardPayment(PAYMENT_AMOUNT);

    const header = new DeployHeader(
      CHAIN_NAME,
      [],
      1,
      new Timestamp(new Date()),
      new Duration(1800000),
      account
    );

    const deploy = Deploy.makeDeploy(header, payment, session);
    const deployJson = Deploy.toJSON(deploy);

    return NextResponse.json({
      ok: true,
      deploy: deployJson,
      proposalId,
      proofHash,
      deployHash: deployJson.hash,
      entryPoint,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
