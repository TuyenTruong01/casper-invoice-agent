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
  'invoice_payment_proof_contract';

const ENTRY_POINT = 'record_payment_proof';
const PAYMENT_AMOUNT = '20000000000';

function onlyDigitsTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const accountPublicKey = String(body?.accountPublicKey || '').trim();
    const proposalId = String(body?.proposalId || `proposal-web-${Date.now()}`);
    const proofHash = String(body?.proofHash || `proof-web-${Date.now()}`);
    const invoiceCount = String(body?.invoiceCount || '0');
    const totalAmount = String(body?.totalAmount || '0');
    const approver = String(body?.approver || 'Browser Manager');
    const executor = String(body?.executor || 'Casper Invoice Agent Web');
    const createdAt = String(body?.createdAt || onlyDigitsTimestamp());

    if (!accountPublicKey) {
      return NextResponse.json(
        { ok: false, error: 'Missing accountPublicKey.' },
        { status: 400 }
      );
    }

    const account = PublicKey.fromHex(accountPublicKey);

    const runtimeArgs = Args.fromMap({});
    runtimeArgs.insert('proposal_id', CLValue.newCLString(proposalId));
    runtimeArgs.insert('proof_hash', CLValue.newCLString(proofHash));
    runtimeArgs.insert('invoice_count', CLValue.newCLUInt32(invoiceCount));
    runtimeArgs.insert('total_amount', CLValue.newCLUint64(totalAmount));
    runtimeArgs.insert('approver', CLValue.newCLString(approver));
    runtimeArgs.insert('executor', CLValue.newCLString(executor));
    runtimeArgs.insert('created_at', CLValue.newCLUint64(createdAt));

    const session = new ExecutableDeployItem();
    session.storedContractByName = new StoredContractByName(
      NAMED_KEY,
      ENTRY_POINT,
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
      createdAt,
      deployHash: deployJson.hash,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}