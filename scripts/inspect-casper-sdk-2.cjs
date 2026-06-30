const sdk = require('casper-js-sdk');

function show(name) {
  const v = sdk[name];
  console.log('\n==============================');
  console.log(name);
  console.log('type:', typeof v);

  if (!v) {
    console.log('NOT FOUND');
    return;
  }

  try {
    console.log('static keys:', Object.getOwnPropertyNames(v));
  } catch (e) {
    console.log('static keys error:', e.message);
  }

  try {
    if (v.prototype) {
      console.log('prototype keys:', Object.getOwnPropertyNames(v.prototype));
    }
  } catch (e) {
    console.log('prototype keys error:', e.message);
  }

  try {
    console.log('toString head:', String(v).slice(0, 700));
  } catch (e) {
    console.log('toString error:', e.message);
  }
}

[
  'HttpHandler',
  'Timestamp',
  'Duration',
  'TransactionScheduling',
  'TransactionTarget',
  'SessionTarget',
  'TransactionRuntime',
  'TransactionV1Payload',
  'TransactionV1',
  'Transaction',
  'FixedMode',
  'PaymentLimitedMode',
  'PricingMode',
  'KeyAlgorithm',
  'Args',
  'CLValueString',
  'CLValueUInt64',
  'CLValueUInt32'
].forEach(show);
