const fs = require('fs');
const path = require('path');

const {
  HttpHandler,
  RpcClient,
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

const NODE_ADDRESS =
  process.env.CASPER_NODE_ADDRESS || 'https://node.testnet.casper.network/rpc';

const CHAIN_NAME =
  process.env.CASPER_CHAIN_NAME || 'casper-test';

const SECRET_KEY_PATH = process.env.CASPER_SECRET_KEY_PATH;

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

const SEND = process.env.CASPER_SEND === '1';

function requireFile(filePath, label) {
  if (!filePath) {
    throw new Error(`Missing ${label}`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

async function main() {
  console.log('Node address:', NODE_ADDRESS);
  console.log('Chain name:', CHAIN_NAME);
  console.log('WASM path:', WASM_PATH);
  console.log('Send mode:', SEND ? 'YES - will submit transaction' : 'NO - dry run only');

  requireFile(SECRET_KEY_PATH, 'CASPER_SECRET_KEY_PATH');
  requireFile(WASM_PATH, 'CASPER_WASM_PATH');

  const pem = fs.readFileSync(SECRET_KEY_PATH, 'utf8');
  const privateKey = PrivateKey.fromPem(pem, KeyAlgorithm.SECP256K1);
  const publicKey = privateKey.publicKey;

  console.log('Public key hex:', publicKey.toHex());

  const wasmBytes = fs.readFileSync(WASM_PATH);
  console.log('WASM size bytes:', wasmBytes.length);

  if (wasmBytes.length <= 0) {
    throw new Error('WASM file is empty.');
  }

  const handler = new HttpHandler(NODE_ADDRESS);
  const client = new RpcClient(handler);

  const status = await client.getStatus();
  console.log('RPC status OK');
  console.log('RPC chainSpecName:', status.rawJSON?.chainspec_name || status.chainSpecName);

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

  console.log('Transaction built and signed.');
  console.log('Transaction hash:', tx.hash.toHex());

  if (!SEND) {
    console.log('');
    console.log('DRY RUN ONLY. No transaction was submitted.');
    console.log('To submit, run again with CASPER_SEND=1');
    return;
  }

  console.log('');
  console.log('Submitting transaction...');
  const result = await client.putTransaction(tx);

  console.log('Put transaction result:');
  console.log(JSON.stringify(result, null, 2));

  console.log('');
  console.log('Submitted transaction hash:');
  console.log(tx.hash.toHex());
}

main().catch((err) => {
  console.error('');
  console.error('Deploy script failed:');
  console.error(err);
  process.exit(1);
});
