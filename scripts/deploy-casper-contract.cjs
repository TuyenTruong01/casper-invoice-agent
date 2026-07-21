const fs = require('fs');
const path = require('path');

const {
  HttpHandler,
  RpcClient,
  PrivateKey,
  PublicKey,
  KeyAlgorithm,
  InitiatorAddr,
  Args,
  CLTypeByteArray,
  CLValue,
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
  PaymentLimitedMode,
  PricingMode,
} = require('casper-js-sdk');

const NODE_ADDRESS =
  process.env.CASPER_NODE_ADDRESS || 'https://node.testnet.casper.network/rpc';

const CHAIN_NAME =
  process.env.CASPER_CHAIN_NAME || 'casper-test';

const PAYMENT_AMOUNT = process.env.CASPER_PAYMENT_AMOUNT;
const INITIAL_MANAGERS = (process.env.CASPER_INITIAL_MANAGERS || '').split(',').map(value => value.trim()).filter(Boolean);
const INITIAL_EXECUTORS = (process.env.CASPER_INITIAL_EXECUTORS || '').split(',').map(value => value.trim()).filter(Boolean);

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
  if (CHAIN_NAME !== 'casper-test' && process.env.CASPER_ALLOW_NON_TESTNET !== '1') {
    throw new Error('Refusing non-testnet chain. Set CASPER_ALLOW_NON_TESTNET=1 only after explicit review.');
  }
  if (!PAYMENT_AMOUNT || !/^\d+$/.test(PAYMENT_AMOUNT)) throw new Error('Missing or invalid CASPER_PAYMENT_AMOUNT');
  if (!INITIAL_MANAGERS.length) throw new Error('CASPER_INITIAL_MANAGERS must contain at least one public key');
  if (!INITIAL_EXECUTORS.length) throw new Error('CASPER_INITIAL_EXECUTORS must contain at least one public key');
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

  const paymentLimited = new PaymentLimitedMode();
  paymentLimited.paymentAmount = PAYMENT_AMOUNT;
  paymentLimited.gasPriceTolerance = 3;

  const pricingMode = new PricingMode();
  pricingMode.paymentLimited = paymentLimited;

  const accountList = values => CLValue.newCLList(
    new CLTypeByteArray(32),
    values.map(value => CLValue.newCLByteArray(PublicKey.fromHex(value).accountHash().hashBytes))
  );
  const installArgs = Args.fromMap(new Map());
  installArgs.insert('initial_managers', accountList(INITIAL_MANAGERS));
  installArgs.insert('initial_executors', accountList(INITIAL_EXECUTORS));

  const payload = TransactionV1Payload.build({
    initiatorAddr: new InitiatorAddr(publicKey),
    args: installArgs,
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

  console.log('');
  console.log('Transaction JSON preview:');
  try {
    console.log(JSON.stringify(tx.toJSON(), null, 2).slice(0, 5000));
  } catch (e) {
    console.log('Could not print tx.toJSON():', e);
  }

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

  const transactionHash = tx.hash.toHex();
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await fetch(NODE_ADDRESS, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc:'2.0', id:Date.now(), method:'info_get_transaction', params:{ transaction_hash:{ Version1:transactionHash }, finalized_approvals:true } }),
    });
    const rpc = await response.json();
    const info = rpc?.result?.execution_info;
    const execution = info?.execution_result?.Version2;
    if (execution) {
      console.log('Execution block height:', info.block_height);
      console.log('Execution error:', execution.error_message ?? null);
      if (execution.error_message != null) throw new Error(`On-chain execution failed: ${execution.error_message}`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw new Error('Timed out waiting for final execution result');
}

main().catch((err) => {
  console.error('');
  console.error('Deploy script failed:');
  console.error(err);
  process.exit(1);
});
