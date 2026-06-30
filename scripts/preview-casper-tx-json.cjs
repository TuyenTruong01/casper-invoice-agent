console.log("preview script is running");

const fs = require('fs');
const path = require('path');

const {
  PrivateKey,
  KeyAlgorithm,
  InitiatorAddr,
  Args,
  Timestamp,
  Duration,
  TransactionScheduling,
  TransactionRuntime,
  SessionTarget,
  TransactionTarget,
  TransactionEntryPoint,
  TransactionEntryPointEnum,
  TransactionV1Payload,
  TransactionV1,
  Transaction,
  FixedMode,
  PricingMode,
} = require('casper-js-sdk');

const SECRET_KEY_PATH = process.env.CASPER_SECRET_KEY_PATH;
const CHAIN_NAME = process.env.CASPER_CHAIN_NAME || 'casper-test';

const WASM_PATH =
  process.env.CASPER_WASM_PATH ||
  path.join(
    process.cwd(),
    'contract',
    'invoice-payment-proof',
    'contract',
    'target',
    'wasm32-unknown-unknown',
    'release',
    'contract.wasm'
  );

if (!SECRET_KEY_PATH) {
  throw new Error('Missing CASPER_SECRET_KEY_PATH');
}

console.log("key path:", SECRET_KEY_PATH);
console.log("wasm path:", WASM_PATH);

const pem = fs.readFileSync(SECRET_KEY_PATH, 'utf8');
const privateKey = PrivateKey.fromPem(pem, KeyAlgorithm.SECP256K1);
const publicKey = privateKey.publicKey;

const wasmBytes = fs.readFileSync(WASM_PATH);
console.log("wasm bytes:", wasmBytes.length);

const session = new SessionTarget();
session.moduleBytes = new Uint8Array(wasmBytes);
session.runtime = TransactionRuntime.vmCasperV1();
session.isInstallUpgrade = true;

const target = new TransactionTarget(undefined, undefined, session);

const fixed = new FixedMode();
fixed.gasPriceTolerance = 10;
fixed.additionalComputationFactor = 2;

const pricingMode = new PricingMode();
pricingMode.fixed = fixed;

const payload = TransactionV1Payload.build({
  initiatorAddr: new InitiatorAddr(publicKey),
  args: Args.fromMap(new Map()),
  ttl: new Duration(30 * 60 * 1000),
  entryPoint: new TransactionEntryPoint(TransactionEntryPointEnum.Call),
  pricingMode,
  timestamp: new Timestamp(new Date()),
  transactionTarget: target,
  scheduling: new TransactionScheduling({}, undefined, undefined),
  chainName: CHAIN_NAME,
});

const txV1 = TransactionV1.makeTransactionV1(payload);
const tx = Transaction.fromTransactionV1(txV1);
tx.sign(privateKey);

const json = tx.toJSON();

if (json?.payload?.fields?.target?.Session?.module_bytes) {
  json.payload.fields.target.Session.module_bytes = `<${wasmBytes.length} bytes omitted>`;
}

console.log("json below:");
console.log(JSON.stringify(json, null, 2));
