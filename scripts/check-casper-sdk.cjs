const sdk = require('casper-js-sdk');
const keys = Object.keys(sdk).sort();

const filters = [
  'Transaction',
  'Deploy',
  'Client',
  'Rpc',
  'Key',
  'Pem',
  'Private',
  'Public',
  'Signer',
  'Wasm',
  'Runtime',
  'Args',
  'Executable',
  'Pricing',
  'Payment'
];

console.log('casper-js-sdk export count:', keys.length);

for (const f of filters) {
  const found = keys.filter(k => k.toLowerCase().includes(f.toLowerCase()));
  console.log(`\n=== ${f} ===`);
  console.log(found.length ? found.join('\n') : '(none)');
}
