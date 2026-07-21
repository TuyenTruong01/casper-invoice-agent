const fs=require('fs');
const { Args,CLValue,ContractHash,Deploy,DeployHeader,Duration,ExecutableDeployItem,HttpHandler,KeyAlgorithm,PrivateKey,RpcClient,StoredContractByHash,Timestamp,TransferDeployItem }=require('casper-js-sdk');
const NODE=process.env.CASPER_NODE_ADDRESS||'https://node.testnet.casper.network/rpc';
const CHAIN=process.env.CASPER_CHAIN_NAME||'casper-test';
const CONTRACT=String(process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH||'').replace(/^contract-/,'');
if(CHAIN!=='casper-test') throw new Error('Testnet only.');
const funder=PrivateKey.fromPem(fs.readFileSync(process.env.CASPER_SECRET_KEY_PATH,'utf8'),KeyAlgorithm.SECP256K1);
const outsider=PrivateKey.generate(KeyAlgorithm.SECP256K1);
const client=new RpcClient(new HttpHandler(NODE));
async function rpc(method,params){const r=await fetch(NODE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})});const j=await r.json();if(j.error)throw new Error(JSON.stringify(j.error));return j.result}
async function wait(hash){for(let i=0;i<120;i++){const x=await rpc('info_get_deploy',{deploy_hash:hash,finalized_approvals:true});if(x.execution_info?.execution_result?.Version2)return x.execution_info;await new Promise(r=>setTimeout(r,5000))}throw new Error('confirmation timeout')}
function deploy(signer,payment,session){const d=Deploy.makeDeploy(new DeployHeader(CHAIN,[],1,new Timestamp(new Date()),new Duration(1800000),signer.publicKey),ExecutableDeployItem.standardPayment(payment),session);d.sign(signer);return d}
async function main(){
 const transferSession=new ExecutableDeployItem(); transferSession.transfer=TransferDeployItem.newTransfer('5000000000',outsider.publicKey,null,Date.now());
 const funding=deploy(funder,'100000000',transferSession); await client.putDeploy(funding); const fundingInfo=await wait(funding.hash.toHex());
 if(fundingInfo.execution_result.Version2.error_message)throw new Error(`Funding failed: ${fundingInfo.execution_result.Version2.error_message}`);
 const args=Args.fromMap({});args.insert('proposal_id',CLValue.newCLString('FINAL-DEMO-001'));
 const call=new ExecutableDeployItem();call.storedContractByHash=new StoredContractByHash(ContractHash.newContract(CONTRACT),'approve_invoice',args);
 const unauthorized=deploy(outsider,'3000000000',call);await client.putDeploy(unauthorized);const info=await wait(unauthorized.hash.toHex());const result=info.execution_result.Version2;
 const passed=/User error:\s*2\b/.test(result.error_message||'')&&(result.transfers||[]).length===0;
 console.log(JSON.stringify({passed,fundingDeployHash:funding.hash.toHex(),fundingBlock:fundingInfo.block_height,unauthorizedDeployHash:unauthorized.hash.toHex(),unauthorizedBlock:info.block_height,errorMessage:result.error_message,contractCallTransfers:result.transfers||[]},null,2));
 if(!passed)throw new Error('Unauthorized RBAC evidence did not match User error 2 with zero transfers.');
}
main().catch(e=>{console.error(e);process.exit(1)});
