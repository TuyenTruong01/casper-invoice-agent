# Contract V2 Predeploy Report

Status: **implemented and locally tested; not deployed to Casper Testnet**.

## Build artifact

- Branch: `feature/casper-contract-rbac-v2`
- Rust: `rustc 1.87.0-nightly (287487624 2025-02-28)` via `nightly-2025-03-01`
- Target: `wasm32-unknown-unknown`
- WASM: `contract/invoice-payment-proof/contract/target/wasm32-unknown-unknown/release/contract.wasm`
- Size: `103,139` bytes
- Built: `2026-07-21T04:52:24.2333979Z`
- SHA-256: `c1626458851506b6df7100d1f07493ca0b81d722d0b1e630671a37e00e4a49f3`
- Build command: `npm run build:contract`

The build uses `-Z build-std=core,alloc` and disables unsupported WASM bulk-memory operations. The vendored `casper-engine-test-support 8.1.1` changes only its test LMDB reservation from approximately 1 TB to approximately 256 MiB so the real execution-engine suite can run on Windows.

## Entry points

| Entry point | Authorized role | Effect |
| --- | --- | --- |
| `create_invoice_proposal` | ADMIN, MANAGER | Creates immutable financial facts in `PENDING` |
| `approve_invoice` | ADMIN, MANAGER | `PENDING → APPROVED`; records caller and block time |
| `reject_invoice` | ADMIN, MANAGER | `PENDING → REJECTED`; records caller and block time |
| `record_payment_proof` | ADMIN, EXECUTOR | `APPROVED → PAID`; records proof, caller and block time |
| `get_invoice_proposal` | Public/read-only | Returns serialized proposal; dictionary readback is preferred off-chain |
| `add_manager` / `remove_manager` | ADMIN | Grants/revokes Manager |
| `add_executor` / `remove_executor` | ADMIN | Grants/revokes Executor |
| `add_admin` / `remove_admin` | ADMIN | Grants/revokes Admin; last Admin cannot be removed |

The deployer becomes the first ADMIN. Installation requires non-empty `initial_managers` and `initial_executors` lists. Identity is always `runtime::get_caller()`; caller names and timestamps are not accepted as runtime arguments.

## State machine

```text
none → PENDING
PENDING → APPROVED
PENDING → REJECTED
APPROVED → PAID
```

Duplicate proposal IDs and duplicate invoice hashes are rejected. Approval/rejection cannot be replayed or crossed. Payment before approval, payment after rejection and proof overwrite are rejected.

## Stored proposal fields

`proposal_id`, `invoice_hash`, `invoice_number_hash`, `vendor_hash`, `amount`, `currency`, `recipient_hash`, `created_by`, `created_at`, `status`, plus transition metadata as applicable: `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `payment_proof`, `payment_recorded_by`, `payment_recorded_at`.

Financial identity fields are bound at creation and retained unchanged through every transition. Role maps, invoice-hash uniqueness index, proposals and sequenced audit records use contract dictionaries.

## Error codes

| Code | Error | Code | Error |
| ---: | --- | ---: | --- |
| 1 | ContractAlreadyInstalled | 13 | InvalidRecipient |
| 2 | Unauthorized | 14 | InvalidProof |
| 3 | ProposalAlreadyExists | 15 | CannotRemoveLastAdmin |
| 4 | InvoiceAlreadyExists | 16 | InvalidAccount |
| 5 | ProposalNotFound | 17 | RoleAlreadyGranted |
| 6 | InvalidState | 18 | RoleNotGranted |
| 7 | AlreadyApproved | 19 | EmptyManagerList |
| 8 | AlreadyRejected | 20 | EmptyExecutorList |
| 9 | AlreadyPaid | 21 | InvalidProposalId |
| 10 | PaymentBeforeApproval | 22 | InvalidInvoiceHash |
| 11 | InvalidAmount | 23 | InvalidInvoiceNumberHash |
| 12 | InvalidCurrency | 24 | InvalidVendorHash |

## Real execution-engine test matrix

The test installs the compiled WASM, calls stored contract entry points from funded test accounts and reads dictionaries from engine state. It does not use an external HashMap state-machine mock.

| Case | Result |
| --- | --- |
| Deployer becomes Admin | PASS |
| Initial Manager and Executor are installed | PASS |
| Admin adds/removes Manager | PASS |
| Admin adds/removes Executor | PASS |
| Admin adds/removes another Admin | PASS |
| Unauthorized caller cannot approve | PASS |
| Unauthorized caller cannot record payment | PASS |
| Create proposal produces PENDING | PASS |
| Duplicate proposal ID rejected | PASS |
| Duplicate invoice hash rejected | PASS |
| Manager approval produces APPROVED | PASS |
| Second approval rejected | PASS |
| Payment before approval rejected | PASS |
| Executor payment proof produces PAID | PASS |
| Second proof rejected and original proof unchanged | PASS |
| Rejection produces REJECTED | PASS |
| Rejected proposal cannot be approved | PASS |
| Final Admin cannot be removed | PASS |
| Approver and payment recorder equal real callers | PASS |
| Amount, currency and recipient hash remain unchanged | PASS |
| Proposal and roles read correctly from dictionaries | PASS |
| Installer account retains no dictionary capability URefs | PASS |

Output: `1 passed; 0 failed`. One comprehensive engine test owns a single installed state and contains all cases above.

## Application and deploy integration

- The API builder supports `create_invoice_proposal`, `approve_invoice`, `reject_invoice`, `record_payment_proof` and `get_invoice_proposal` using the V2 argument names/types.
- Frontend-supplied approver, executor and timestamps were removed.
- The UI does not fall back to the old V1 contract hash and only marks `PAID` after a successful execution result.
- Deploy script defaults to `casper-test`, refuses another chain unless explicitly overridden, validates key/WASM paths, requires initial role lists, supports dry-run and polls to a final execution result after submission.
- No private key content is logged.

## Quality gates

- `npm run lint`: PASS
- `npm test`: PASS (`9/9`)
- `npm run build`: PASS
- `npm run test:contract`: PASS (real WASM execution engine)
- Deploy scripts `node --check`: PASS

## Remaining limitations

- No CSPR/token transfer, vendor settlement or escrow occurs. `PAID` means an approved payment-proof record was anchored, not that a vendor received funds.
- Audit history uses a sequenced dictionary rather than a standardized event stream. Business and role changes are logged; installation itself has no audit row because the contract dictionary context becomes active only after install completes.
- Proposal serialization rejects delimiter characters (`;` and `=`) in all user-controlled string fields. A future version should still replace this convention with a versioned bytesrepr struct.
- V2 is not deployed; there are no V2 contract/package/deploy hashes yet. Old hashes must not be used as V2 evidence.
- The UI currently exposes the payment-proof signing flow. Full UI controls for create/approve/reject and dictionary readback still require wiring before an end-to-end demo.

## Required deployment variables

```env
CASPER_NODE_ADDRESS=https://node.testnet.casper.network/rpc
CASPER_CHAIN_NAME=casper-test
CASPER_SECRET_KEY_PATH=
CASPER_WASM_PATH=
CASPER_PAYMENT_AMOUNT=
CASPER_INITIAL_MANAGERS=
CASPER_INITIAL_EXECUTORS=
```

`CASPER_INITIAL_MANAGERS` and `CASPER_INITIAL_EXECUTORS` are comma-separated Casper public keys. No `.env.local`, PEM, private key, seed phrase or API key was added to Git.

## Transaction confirmation

**No Casper transaction was created, signed or submitted in this task.**
