const fs = require('fs');
const crypto = require('crypto');
const {
  Args, CLValue, ContractHash, Deploy, DeployHeader, Duration, ExecutableDeployItem,
  HttpHandler, KeyAlgorithm, PrivateKey, RpcClient, StoredContractByHash, Timestamp,
} = require('casper-js-sdk');

const NODE = process.env.CASPER_NODE_ADDRESS || 'https://node.testnet.casper.network/rpc';
const CHAIN = process.env.CASPER_CHAIN_NAME || 'casper-test';
const SECRET = process.env.CASPER_SECRET_KEY_PATH;
const CONTRACT = String(process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH || '').replace(/^contract-/, '');
const PAYMENT = process.env.CASPER_CALL_PAYMENT_AMOUNT || '20000000000';
const SEND = process.env.CASPER_SEND === '1';
const RESUME_REMAINING = process.env.CASPER_EVIDENCE_RESUME === 'remaining';
const evidence = { generatedAt: new Date().toISOString(), network: CHAIN, contractHash: `contract-${CONTRACT}`, tests: [] };

if (CHAIN !== 'casper-test') throw new Error('This evidence script only permits casper-test.');
if (!SECRET || !fs.existsSync(SECRET)) throw new Error('CASPER_SECRET_KEY_PATH is missing.');
if (!/^[a-f0-9]{64}$/i.test(CONTRACT)) throw new Error('NEXT_PUBLIC_CASPER_CONTRACT_HASH is invalid.');

const privateKey = PrivateKey.fromPem(fs.readFileSync(SECRET, 'utf8'), KeyAlgorithm.SECP256K1);
const publicKey = privateKey.publicKey;
const client = new RpcClient(new HttpHandler(NODE));

async function rpc(method, params) {
  const response = await fetch(NODE, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params}) });
  const json = await response.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}: ${json.error.data || ''}`);
  return json.result;
}

async function root() { return (await rpc('info_get_status', {})).last_added_block_info.state_root_hash; }

async function contractState() {
  const result = await rpc('state_get_item', { state_root_hash:await root(), key:`hash-${CONTRACT}`, path:[] });
  return result.stored_value.Contract;
}

async function dictionary(dictionaryName, itemKey) {
  const contract = await contractState();
  const seed = contract.named_keys.find(item => item.name === dictionaryName)?.key;
  if (!seed) throw new Error(`Missing dictionary ${dictionaryName}`);
  try {
    const result = await rpc('state_get_dictionary_item', { state_root_hash:await root(), dictionary_identifier:{ URef:{ seed_uref:seed, dictionary_item_key:itemKey } } });
    return result.stored_value.CLValue.parsed;
  } catch (error) {
    if (/ValueNotFound|Failed to find|value was not found/i.test(String(error))) return null;
    throw error;
  }
}

function makeDeploy(entryPoint, args) {
  const runtimeArgs = Args.fromMap({});
  for (const [name, value] of Object.entries(args)) runtimeArgs.insert(name, value);
  const session = new ExecutableDeployItem();
  session.storedContractByHash = new StoredContractByHash(ContractHash.newContract(CONTRACT), entryPoint, runtimeArgs);
  const deploy = Deploy.makeDeploy(
    new DeployHeader(CHAIN, [], 1, new Timestamp(new Date()), new Duration(1_800_000), publicKey),
    ExecutableDeployItem.standardPayment(PAYMENT), session,
  );
  deploy.sign(privateKey);
  return deploy;
}

async function execute(name, entryPoint, args, expectedSuccess, expectedUserCode, stateReader) {
  const before = stateReader ? await stateReader() : null;
  const deploy = makeDeploy(entryPoint, args);
  const hash = deploy.hash.toHex();
  if (!SEND) {
    console.log(`[DRY] ${name}: ${entryPoint} ${hash}`);
    return;
  }
  await client.putDeploy(deploy);
  let info;
  for (let attempt=0; attempt<120; attempt++) {
    const result = await rpc('info_get_deploy', { deploy_hash:hash, finalized_approvals:true });
    if (result.execution_info?.execution_result?.Version2) { info=result.execution_info; break; }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (!info) throw new Error(`${name}: confirmation timeout`);
  const result = info.execution_result.Version2;
  const success = result.error_message == null;
  const after = stateReader ? await stateReader() : null;
  const codeMatch = String(result.error_message || '').match(/User error:\s*(\d+)/i) || String(result.error_message || '').match(/User\((\d+)\)/i);
  const userCode = codeMatch ? Number(codeMatch[1]) : null;
  const passed = success === expectedSuccess && (expectedSuccess || expectedUserCode == null || userCode === expectedUserCode);
  const row = { name, entryPoint, deployHash:hash, blockHeight:info.block_height, success, expectedSuccess, expectedUserCode:expectedUserCode ?? null, userCode, errorMessage:result.error_message, transfers:result.transfers || [], before, after, passed };
  evidence.tests.push(row);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${hash} block=${info.block_height} success=${success} userCode=${userCode} transfers=${row.transfers.length}`);
  if (!passed) throw new Error(`${name}: unexpected execution result: ${result.error_message}`);
}

const s = value => CLValue.newCLString(value);
const proposalArgs = (id, invoiceHash) => ({
  proposal_id:s(id), invoice_hash:s(invoiceHash),
  invoice_number_hash:s(crypto.createHash('sha256').update(`${id}:invoice-number`).digest('hex')),
  vendor_hash:s(crypto.createHash('sha256').update(`${id}:vendor`).digest('hex')),
  amount:CLValue.newCLUint64('1375'), currency:s('USD'),
  recipient_hash:s(crypto.createHash('sha256').update(`${id}:recipient`).digest('hex')),
});

async function main() {
  console.log(`Mode: ${SEND ? 'SEND' : 'DRY RUN'}; signer=${publicKey.toHex()}; contract=contract-${CONTRACT}`);
  const accountHash = publicKey.accountHash().toPrefixedString();
  const contract = await contractState();
  evidence.contractPackageHash = contract.contract_package_hash;
  evidence.entryPoints = contract.entry_points.map(item => item.name);
  evidence.namedKeys = contract.named_keys.map(item => item.name);
  evidence.roles = {
    admin:await dictionary('admins', accountHash), manager:await dictionary('managers', accountHash), executor:await dictionary('executors', accountHash),
  };
  const account = await rpc('query_global_state', { state_identifier:null, key:accountHash, path:[] });
  evidence.installerNamedKeys = account.stored_value.Account.named_keys;

  if (!RESUME_REMAINING) {
  const id1='FINAL-DEMO-001'; const hash1=crypto.createHash('sha256').update('FINAL-DEMO-001|real-demo-invoice').digest('hex');
  const state1=()=>dictionary('invoice_proposals',id1);
  await execute('P1 create', 'create_invoice_proposal', proposalArgs(id1,hash1), true, null, state1);
  await execute('P1 duplicate proposal id', 'create_invoice_proposal', proposalArgs(id1,crypto.randomBytes(32).toString('hex')), false, 3, state1);
  await execute('P1 duplicate invoice hash', 'create_invoice_proposal', proposalArgs('FINAL-DEMO-001-DUP',hash1), false, 4, state1);
  await execute('P1 approve', 'approve_invoice', {proposal_id:s(id1)}, true, null, state1);
  await execute('P1 approve twice', 'approve_invoice', {proposal_id:s(id1)}, false, 7, state1);
  const proof=crypto.createHash('sha256').update('FINAL-DEMO-001|payment-proof|casper-test').digest('hex');
  await execute('P1 record proof', 'record_payment_proof', {proposal_id:s(id1),payment_proof:s(proof)}, true, null, state1);
  await execute('P1 overwrite proof', 'record_payment_proof', {proposal_id:s(id1),payment_proof:s('overwrite-attempt')}, false, 9, state1);

  const id2='FINAL-DEMO-002'; const hash2=crypto.createHash('sha256').update('FINAL-DEMO-002|real-demo-invoice').digest('hex'); const state2=()=>dictionary('invoice_proposals',id2);
  await execute('P2 create', 'create_invoice_proposal', proposalArgs(id2,hash2), true, null, state2);
  await execute('P2 proof before approval', 'record_payment_proof', {proposal_id:s(id2),payment_proof:s('too-early')}, false, 10, state2);
  await execute('P2 reject', 'reject_invoice', {proposal_id:s(id2)}, true, null, state2);
  await execute('P2 approve rejected', 'approve_invoice', {proposal_id:s(id2)}, false, 8, state2);
  await execute('P2 proof rejected', 'record_payment_proof', {proposal_id:s(id2),payment_proof:s('rejected-proof')}, false, 8, state2);
  } else {
    const state2=()=>dictionary('invoice_proposals','FINAL-DEMO-002');
    await execute('P2 proof rejected', 'record_payment_proof', {proposal_id:s('FINAL-DEMO-002'),payment_proof:s('rejected-proof-recheck')}, false, 8, state2);
  }

  const demoHash=crypto.createHash('sha256').update('casper-v2-demo-manager').digest(); const demoAccount=`account-hash-${demoHash.toString('hex')}`;
  const role=()=>dictionary('managers',demoAccount);
  await execute('Role add demo manager', 'add_manager', {account:CLValue.newCLByteArray(demoHash)}, true, null, role);
  await execute('Role remove demo manager', 'remove_manager', {account:CLValue.newCLByteArray(demoHash)}, true, null, role);
  await execute('Role cannot remove final admin', 'remove_admin', {account:CLValue.newCLByteArray(publicKey.accountHash().hashBytes)}, false, 15, ()=>dictionary('admins',accountHash));

  evidence.allPassed = evidence.tests.every(item => item.passed);
  evidence.transferCount = evidence.tests.reduce((sum,item)=>sum+item.transfers.length,0);
  fs.writeFileSync('CASPER_TESTNET_EVIDENCE_V2.json', JSON.stringify(evidence,null,2)+'\n');
  console.log(`Evidence written. allPassed=${evidence.allPassed}; transferCount=${evidence.transferCount}`);
}

main().catch(error => { console.error(error); process.exit(1); });
