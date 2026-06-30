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
    console.log('toString head:', String(v).slice(0, 500));
  } catch (e) {
    console.log('toString error:', e.message);
  }
}

[
  'RpcClient',
  'Transaction',
  'TransactionV1',
  'PutTransactionRequest',
  'PrivateKey',
  'PublicKey',
  'ContractWasm',
  'Args',
  'PricingMode',
  'TransactionRuntime',
  'TransactionCategory',
  'TransactionEntryPoint',
  'EntryPointPayment',
  'PaymentLimitedMode'
].forEach(show);
