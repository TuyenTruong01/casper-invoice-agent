# Casper Testnet Proof

## Network

- Network: Casper Testnet
- Chain name: casper-test
- RPC: https://node.testnet.casper.network/rpc

## Contract

### Active Contract V2

- Contract hash: contract-665c9c51d288b2228b6146fe550744dc05002ba002f58cfd9016b4c36bdd7f27
- Contract package hash: contract-package-4838cb34754dc5ed8c5dfd0f61e688325255b6cbbe61358ad39cb1141e609aae
- Deployment transaction hash: 093c5fbcc3d8f242045e18fa026ba90c997443a44f4f44a0ec188e95ab6ae818
- Deployment block height: 8574143
- Execution result: `error_message: null`
- Execution consumed: 93310092878 motes (payment limit: 150000000000 motes)
- WASM size: 103139 bytes
- WASM SHA-256: c1626458851506b6df7100d1f07493ca0b81d722d0b1e630671a37e00e4a49f3
- Initial Manager and Executor: account-hash-1fb18f386255d46ef8ac0d2131bed54e87159848dde38726068997a6331b880d

### Archived proof-only Contract V1

- Named key: invoice_payment_proof_contract
- Contract hash: contract-4e2f1bbc04fdb44e2654b014124d21b48457330b9e9031813fa6b8e1608bc991
- Contract package hash: contract-package-36e343e0079db3d7d49b13913b78a07ddde0459ed2c0ba1b99d75826ad0edd5b
- Contract deploy hash: 1864adf9f8a6079b1f1aa64666df21d05ed4afe151777b9d4db31ca22f922eef
- Contract deploy block height: 8347564

## Original CLI proof

- Proposal ID: proposal-demo-002
- Proof hash: proof-hash-demo-002
- Record proof deploy hash: 672f3c4b462a0f7ba85a8fad193429a2034fe581dba56bff60aa10f96196af91
- Record proof block height: 8347679
- Get proof deploy hash: 32cd10f76d60833071dcf7f464fed1261a79306965a624f76eb673e195c24175
- Get proof block height: 8347716

## Browser wallet proof

The dApp supports real Casper Wallet execution from the browser.

- Browser wallet deploy hash: 9df3e0e174023ab3afbc7b3ca7e528887f25c334c346be1d5437594aded21e07
- Browser wallet block height: 8348729
- Execution result: error_message null
- Cost: 20000000000 motes
- Signer public key: 02021b723610797a778fb372b610ca70ce2a7ec675bf5e631920c4b155ed96a71942

## Verified flow

1. Smart contract deployed successfully on Casper Testnet.
2. `record_payment_proof` was called successfully through CLI.
3. `get_payment_proof` was called successfully through CLI.
4. Casper Wallet was connected in the browser.
5. The frontend mapped the connected public key to the Manager role.
6. The Manager signed a `record_payment_proof` deploy through Casper Wallet.
7. The signed deploy was submitted to Casper Testnet and executed successfully.
