const fs = require('fs');
const {
  HttpHandler,
  RpcClient,
  PrivateKey,
  KeyAlgorithm,
  AccountIdentifier
} = require('casper-js-sdk');

const NODE_ADDRESS =
  process.env.CASPER_NODE_ADDRESS || 'https://node.testnet.casper.network/rpc';

const keyPath = process.env.CASPER_SECRET_KEY_PATH;

if (!keyPath) {
  console.error('Missing CASPER_SECRET_KEY_PATH');
  process.exit(1);
}

if (!fs.existsSync(keyPath)) {
  console.error('Key file not found:', keyPath);
  process.exit(1);
}

const pem = fs.readFileSync(keyPath, 'utf8');
const privateKey = PrivateKey.fromPem(pem, KeyAlgorithm.SECP256K1);
const publicKey = privateKey.publicKey;

async function main() {
  console.log('Node address:', NODE_ADDRESS);
  console.log('Public key hex:', publicKey.toHex());

  const handler = new HttpHandler(NODE_ADDRESS);
  const client = new RpcClient(handler);

  const accountIdentifier = new AccountIdentifier(undefined, publicKey);
  const accountInfo = await client.getAccountInfo(null, accountIdentifier);

  console.log('Account info OK');
  console.log('Account hash:', accountInfo.rawJSON?.account?.account_hash);

  const mainPurse =
    accountInfo.rawJSON?.account?.main_purse ||
    accountInfo.rawJSON?.stored_value?.Account?.main_purse;

  if (!mainPurse || typeof mainPurse !== 'string') {
    console.log('Could not find string main_purse.');
    console.log(JSON.stringify(accountInfo, null, 2).slice(0, 3000));
    process.exit(1);
  }

  console.log('Main purse:', mainPurse);

  const balance = await client.getLatestBalance(mainPurse);

  console.log('Balance result:');
  console.log(JSON.stringify(balance, null, 2).slice(0, 3000));

  const motes =
    balance.balance ||
    balance.motes ||
    balance.rawJSON?.balance_value ||
    balance.rawJSON?.balance ||
    balance.rawJSON?.result?.balance_value;

  if (motes) {
    console.log('Balance motes:', motes);
    console.log('Approx CSPR:', Number(motes) / 1_000_000_000);
  }
}

main().catch((err) => {
  console.error('Balance check failed:');
  console.error(err);
  process.exit(1);
});
