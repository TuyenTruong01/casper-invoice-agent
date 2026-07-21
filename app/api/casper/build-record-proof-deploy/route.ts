import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { appendAudit, getDb, getInvoice } from '../../../../lib/db';

const { Args, PublicKey, CLValue, ContractHash, DeployHeader, Deploy, ExecutableDeployItem, StoredContractByHash, Timestamp, Duration } = require('casper-js-sdk');

const CHAIN_NAME = process.env.NEXT_PUBLIC_CASPER_NETWORK || 'casper-test';
const PAYMENT_AMOUNT = process.env.CASPER_CALL_PAYMENT_AMOUNT || '20000000000';
const ACTIONS = new Set(['create_invoice_proposal', 'approve_invoice', 'reject_invoice', 'record_payment_proof']);

type ProposalRow = Record<string, string | number | null>;

export async function POST(req: NextRequest) {
  try {
    if (CHAIN_NAME !== 'casper-test') return NextResponse.json({ ok:false, error:'Only casper-test is allowed.' }, { status:400 });
    const contractHash = String(process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH || '').replace(/^contract-/, '');
    if (!/^[a-f0-9]{64}$/i.test(contractHash)) return NextResponse.json({ ok:false, error:'Contract V2 hash is not configured.' }, { status:503 });
    const body = await req.json();
    const invoiceId = String(body?.invoiceId || '').trim();
    const accountPublicKey = String(body?.accountPublicKey || '').trim();
    const entryPoint = String(body?.entryPoint || '').trim();
    if (!invoiceId || !accountPublicKey || !ACTIONS.has(entryPoint)) return NextResponse.json({ ok:false, error:'invoiceId, accountPublicKey and a supported V2 entryPoint are required.' }, { status:400 });
    const account = PublicKey.fromHex(accountPublicKey);
    const invoice = getInvoice(invoiceId);
    if (!invoice) return NextResponse.json({ ok:false, error:'Invoice not found.' }, { status:404 });
    const proposal = getDb().prepare('SELECT * FROM proposals WHERE invoice_id=?').get(invoiceId) as ProposalRow | undefined;
    if (!proposal) return NextResponse.json({ ok:false, error:'No backend-created proposal exists for this invoice.' }, { status:409 });
    if (String(invoice.risk_decision) !== 'AUTO_PROPOSE' || String(proposal.risk_decision) !== 'AUTO_PROPOSE') {
      return NextResponse.json({ ok:false, error:'Only AUTO_PROPOSE invoices can reach Casper.' }, { status:403 });
    }
    const onchain = String(proposal.onchain_status || 'NONE');
    if (entryPoint === 'create_invoice_proposal' && onchain !== 'NONE') return NextResponse.json({ ok:false, error:'Proposal was already submitted or confirmed on-chain.' }, { status:409 });
    if ((entryPoint === 'approve_invoice' || entryPoint === 'reject_invoice') && onchain !== 'PENDING') return NextResponse.json({ ok:false, error:'Proposal must be confirmed PENDING before approval or rejection.' }, { status:409 });
    if (entryPoint === 'record_payment_proof' && onchain !== 'APPROVED') return NextResponse.json({ ok:false, error:'Proposal must be confirmed APPROVED before recording proof.' }, { status:409 });

    const runtimeArgs = Args.fromMap({});
    runtimeArgs.insert('proposal_id', CLValue.newCLString(String(proposal.id)));
    let proofHash: string | null = null;
    if (entryPoint === 'create_invoice_proposal') {
      if (!Number.isSafeInteger(Number(proposal.amount)) || Number(proposal.amount) <= 0) return NextResponse.json({ ok:false, error:'Contract V2 requires a positive integer amount.' }, { status:422 });
      runtimeArgs.insert('invoice_hash', CLValue.newCLString(String(proposal.invoice_hash)));
      runtimeArgs.insert('invoice_number_hash', CLValue.newCLString(String(proposal.invoice_number_hash)));
      runtimeArgs.insert('vendor_hash', CLValue.newCLString(String(proposal.vendor_hash)));
      runtimeArgs.insert('amount', CLValue.newCLUint64(String(proposal.amount)));
      runtimeArgs.insert('currency', CLValue.newCLString(String(proposal.currency)));
      runtimeArgs.insert('recipient_hash', CLValue.newCLString(String(proposal.recipient_hash)));
    } else if (entryPoint === 'record_payment_proof') {
      proofHash = String(body?.proofHash || crypto.createHash('sha256').update(`${proposal.id}:${Date.now()}`).digest('hex'));
      runtimeArgs.insert('payment_proof', CLValue.newCLString(proofHash));
    }

    const session = new ExecutableDeployItem();
    session.storedContractByHash = new StoredContractByHash(ContractHash.newContract(contractHash), entryPoint, runtimeArgs);
    const deploy = Deploy.makeDeploy(
      new DeployHeader(CHAIN_NAME, [], 1, new Timestamp(new Date()), new Duration(1_800_000), account),
      ExecutableDeployItem.standardPayment(PAYMENT_AMOUNT),
      session,
    );
    const deployJson = Deploy.toJSON(deploy);
    const actionId = crypto.randomUUID();
    const now = new Date().toISOString();
    getDb().prepare(`INSERT INTO blockchain_actions(id,invoice_id,proposal_id,action,deploy_hash,execution_status,caller_public_key,created_at,updated_at)
      VALUES(?,?,?,?,?, 'BUILT', ?,?,?)`).run(actionId, invoiceId, proposal.id, entryPoint, deployJson.hash, accountPublicKey, now, now);
    appendAudit(invoiceId, String(proposal.id), 'CASPER_DEPLOY_BUILT', accountPublicKey, { actionId, entryPoint, deployHash:deployJson.hash });
    return NextResponse.json({ ok:true, actionId, deploy:deployJson, deployHash:deployJson.hash, proposalId:proposal.id, proofHash, entryPoint });
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : String(error) }, { status:500 });
  }
}
