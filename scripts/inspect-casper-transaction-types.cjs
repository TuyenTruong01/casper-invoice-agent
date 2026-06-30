const sdk = require('casper-js-sdk');

for (const name of [
  'TransactionCategory',
  'TransactionRuntime',
  'TransactionEntryPointEnum',
  'PricingMode',
  'FixedMode',
  'PaymentLimitedMode',
  'SessionTarget',
  'TransactionTarget',
  'TransactionV1Payload'
]) {
  console.log('\n---', name, '---');
  console.log(sdk[name]);

  if (sdk[name]) {
    console.log('prototype:', Object.getOwnPropertyNames(sdk[name].prototype || {}));
    console.log('static:', Object.getOwnPropertyNames(sdk[name]));
    console.log('source:', String(sdk[name]).slice(0, 1200));
  }
}
