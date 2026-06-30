const { HttpHandler, RpcClient } = require('casper-js-sdk');

const NODE_ADDRESS =
  process.env.CASPER_NODE_ADDRESS || 'https://node.testnet.casper.network/rpc';

async function main() {
  console.log('Node address:', NODE_ADDRESS);

  const handler = new HttpHandler(NODE_ADDRESS);
  const client = new RpcClient(handler);

  const status = await client.getStatus();
  console.log('Status OK');
  console.log(JSON.stringify(status, null, 2).slice(0, 1500));

  const stateRoot = await client.getStateRootHashLatest();
  console.log('State root OK');
  console.log(JSON.stringify(stateRoot, null, 2).slice(0, 1500));
}

main().catch((err) => {
  console.error('RPC test failed:');
  console.error(err);
  process.exit(1);
});
