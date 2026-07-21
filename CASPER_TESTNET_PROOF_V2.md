# Casper Testnet Contract V2 Evidence (Steps 6-8)

## Deployment under test

- Network: `casper-test`
- Contract hash: `contract-665c9c51d288b2228b6146fe550744dc05002ba002f58cfd9016b4c36bdd7f27`
- Package hash: `contract-package-4838cb34754dc5ed8c5dfd0f61e688325255b6cbbe61358ad39cb1141e609aae`
- Contract version: `1`
- Named key: `invoice_payment_proof_contract_v2`
- Installer transaction: `093c5fbcc3d8f242045e18fa026ba90c997443a44f4f44a0ec188e95ab6ae818`
- WASM SHA-256: `c1626458851506b6df7100d1f07493ca0b81d722d0b1e630671a37e00e4a49f3`

## Step 6: deployed-state verification

- ABI exposes all 11 V2 entry points: create, approve, reject, record proof, getter, and Admin role-management methods.
- Named state contains `admins`, `managers`, `executors`, `invoice_proposals`, `invoice_hash_index`, `audit_log`, `audit_sequence`, and `admin_count`.
- Deployer account is `Admin=true`, `Manager=true`, and `Executor=true` in the on-chain dictionaries.
- Installer account retains only the contract hash named key. It does not retain any role/proposal/audit dictionary URef.
- Final audit sequence after the evidence run: `7`.

## Demo input derivation

All hashes are lowercase SHA-256 hex strings:

- `invoice_hash = SHA256("<proposal-id>|real-demo-invoice")`
- `invoice_number_hash = SHA256("<proposal-id>:invoice-number")`
- `vendor_hash = SHA256("<proposal-id>:vendor")`
- `recipient_hash = SHA256("<proposal-id>:recipient")`
- Proposal 1 proof: `SHA256("FINAL-DEMO-001|payment-proof|casper-test")`

Both proposals use amount `1375` and currency `USD`.

## Step 7: on-chain state-machine evidence

| Test | Result | User code | Block | Deploy hash |
|---|---|---:|---:|---|
| P1 create -> PENDING | PASS | - | 8574335 | `b4e015fcae156de98149239538957b29779c4bd568c930ba07d66e75a4e77124` |
| P1 duplicate proposal ID | EXPECTED REJECT | 3 | 8574337 | `fe311ea4db1a02c8083fdaa4b48d4ed56113597baa8cc60070e29adfd405434a` |
| P1 duplicate invoice hash | EXPECTED REJECT | 4 | 8574339 | `7d4bb2addaf728c58709d69fbc95d1cc6ae27da5da70de14abe5915712171010` |
| P1 approve -> APPROVED | PASS | - | 8574340 | `a0e1cf851968d6bf37a6287f595e6042eac7fefd217bb915d0470f1fc5637a84` |
| P1 approve twice | EXPECTED REJECT | 7 | 8574342 | `f11a53c1ebd840e19c7cb0867a98a363d3cf1855e3955f0be7028e78bbfacfce` |
| P1 record proof -> PAID | PASS | - | 8574344 | `120d6b15887f85517d1e90a21cd2b26bf7ddeeb30689c1dd03d51f58fcd7337a` |
| P1 overwrite proof | EXPECTED REJECT | 9 | 8574345 | `404d7957d6f800afed48e8abaa1cc1d742f9655646a589a37fa493b36d312f68` |
| P2 create -> PENDING | PASS | - | 8574347 | `84551c77e99884b195014dc130c27ae7e19a6befa3fc427d20e070b6dd1168ab` |
| P2 proof before approval | EXPECTED REJECT | 10 | 8574348 | `a9ea5ac4ee5084026862c1a59097c86f208ea4981a51b502dc2b6d2e5feba9f0` |
| P2 reject -> REJECTED | PASS | - | 8574350 | `d0b6097f0d8d1bd913674e22a511e62894cb2d2be50d1bd87b03a71a7fa1793a` |
| P2 approve rejected | EXPECTED REJECT | 8 | 8574351 | `70007f6879efd8a3fbd41c8dc7191310ddafbfdffa7165e5f5dc90cc97725512` |
| P2 proof rejected | EXPECTED REJECT | 8 | 8574362 | `40b5110c52d9149672f3638f209b3e1626fe69ec26983ac016767ca64d257ba1` |
| Unauthorized approve | EXPECTED REJECT | 2 | 8574383 | `4ca6220290ca2dceb66ae49e318d541ab32e7525d1abb9304c6fc2e451025a44` |
| Admin adds demo Manager | PASS | - | 8574363 | `2e922e83c1ee1ddbae100bf529085da51db124c6b4f84098b58ee4a799b8835d` |
| Admin removes demo Manager | PASS | - | 8574364 | `c71454d22b1f2c034213e27d0d0160c29e93cb1a2a38c1904a63a64c78c1ca6b` |
| Remove final Admin | EXPECTED REJECT | 15 | 8574366 | `a99d6f498a4c9c0e276eaf0abb6658b00c45691b32a89743d1a1d53d13db181f` |

Final dictionary readback confirms `FINAL-DEMO-001` is `PAID` with its original proof unchanged and `FINAL-DEMO-002` is `REJECTED` with no payment proof.

The unauthorized test used an ephemeral Testnet key held only in process memory. Funding transaction `fe914e164d4f4fff4c39d1aa0d9e45a85d607bfcebd1da2d1aac2847ca135700` supplied test gas and is not a contract business action.

## Step 8: transfer verification and precise claim

Every contract call listed above has `transfers: []`, including successful state transitions and expected reverts. Contract-call transfer count is therefore `0`.

The correct product claim is:

> On-chain approval and payment-proof anchoring on Casper.

`PAID` means a payment proof was anchored after approval. This contract does not transfer CSPR/tokens, settle a vendor, release escrow, or prove that a vendor received money.
