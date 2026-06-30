const fs = require('fs');
const {
  PrivateKey,
  KeyAlgorithm
} = require('casper-js-sdk');

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

console.log('Key file:', keyPath);
console.log('PEM header:', pem.split(/\r?\n/)[0]);

const candidates = [
  ['ED25519', KeyAlgorithm.ED25519],
  ['SECP256K1', KeyAlgorithm.SECP256K1],
];

let ok = false;

for (const [name, alg] of candidates) {
  try {
    const privateKey = PrivateKey.fromPem(pem, alg);
    const publicKey = privateKey.publicKey;

    console.log('');
    console.log('SUCCESS with algorithm:', name);
    console.log('Public key hex:', publicKey.toHex());
    console.log('Account hash:', publicKey.accountHash().toString());

    ok = true;
    break;
  } catch (err) {
    console.log('');
    console.log('Failed with algorithm:', name);
    console.log(err.message);
  }
}

if (!ok) {
  console.error('');
  console.error('Could not parse PEM with ED25519 or SECP256K1.');
  process.exit(1);
}
