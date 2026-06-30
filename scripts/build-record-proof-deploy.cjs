const fs = require('fs');
const path = require('path');

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

const MANAGER_PUBLIC_KEY =
  '02021b723610797a778fb372b610ca70ce2a7ec675bf5e631920c4b155ed96a71942';

const CHAIN_NAME = 'casper-test';
const NAMED_KEY = 'invoice_payment_proof_contract';
const ENTRY_POINT = 'record_payment_proof';
const PAYMENT_AMOUNT = '20000000000';

const now = Date.now();
const proposalId = `proposal-browser-${now}`;
const proofHash = `browser-proof-${now}`;

const createdAt = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14);

const account = PublicKey.fromHex(MANAGER_PUBLIC_KEY);

const runtimeArgs = Args.fromMap({});
runtimeArgs.insert('proposal_id', CLValue.newCLString(proposalId));
runtimeArgs.insert('proof_hash', CLValue.newCLString(proofHash));
runtimeArgs.insert('invoice_count', CLValue.newCLUInt32('3'));
runtimeArgs.insert('total_amount', CLValue.newCLUint64('125000'));
runtimeArgs.insert('approver', CLValue.newCLString('Browser Manager'));
runtimeArgs.insert('executor', CLValue.newCLString('Casper Invoice Agent Web'));
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
const json = Deploy.toJSON(deploy);

const outDir = path.join(process.cwd(), 'scripts', 'out');
fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, 'record-proof-unsigned-deploy.json');
fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf8');

console.log('Unsigned deploy JSON created:');
console.log(outPath);
console.log('');
console.log('Proposal ID:', proposalId);
console.log('Proof hash:', proofHash);
console.log('Created at:', createdAt);
console.log('Deploy hash:', json.hash);
console.log('Approvals:', json.approvals?.length || 0);
console.log('Chain:', json.header?.chain_name || json.header?.chainName);
console.log('Account:', json.header?.account);
console.log('');
console.log('Session JSON preview:');
console.log(JSON.stringify(json.session, null, 2).slice(0, 1200));