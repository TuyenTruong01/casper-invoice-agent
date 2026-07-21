# Casper Invoice Agent

Accounts-payable workflow with real PDF text extraction, schema-validated AI extraction, deterministic risk rules, SQLite persistence and Casper Testnet proof anchoring.

## Implemented pipeline

1. PDF upload validates MIME type, size (10 MB maximum) and `%PDF-` signature.
2. `pdf-parse` extracts the PDF text on the server; files are stored under ignored `data/uploads/`.
3. Gemini structured output returns JSON constrained by JSON Schema, parsed with `JSON.parse`, then validated again with Zod: invoice number, vendor, dates, amount, currency, recipient wallet, confidence and missing fields.
4. Risk Agent checks duplicate SHA-256/file number, historical amount anomaly, vendor wallet mismatch, payment limit, missing fields and confidence.
5. Invoice, extraction, risk and execution state persist in SQLite at ignored `data/runtime/invoices.sqlite`.
6. Casper execution status is polled via `info_get_deploy`; the UI marks invoices Paid only after a successful on-chain result.

The 50 files in `public/invoices/` and `data/seed.ts` remain synthetic demo fixtures. The new upload pipeline does not treat those seed flags as AI results.

## Setup

```bash
copy .env.example .env.local
npm install
npm run dev
```

Set the server-only `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to stable `gemini-3.5-flash`. Missing/failed Gemini configuration returns a visible error and never fabricates extraction output. Gemini only extracts document facts; the provider-independent Risk Agent remains solely responsible for risk decisions. Gemini does not approve invoices or execute payments.

## Verification

```bash
npm run lint
npm test
npm run build
npm run build:contract
npm run test:contract
npm run test:gemini
```

Contract tests install and execute the compiled WASM in `casper-engine-test-support 8.1.1`, then read role and proposal dictionaries back from engine state. A vendored test-support crate only reduces upstream's approximately 1 TB LMDB reservation to 256 MiB for reproducible Windows tests; execution semantics are unchanged.

## Contract state machine

- `create_invoice_proposal`: Admin or Manager creates an immutable financial payload in `PENDING`; duplicate proposal IDs and invoice hashes are rejected.
- `approve_invoice` / `reject_invoice`: Admin or Manager moves a `PENDING` proposal to `APPROVED` or `REJECTED` and binds the actual runtime caller and block time.
- `record_payment_proof`: Admin or Executor moves `APPROVED` to `PAID`, binds the actual caller and rejects proof overwrite.
- `get_invoice_proposal`: returns the proposal record. Off-chain clients can also read `invoice_proposals` directly by dictionary key.
- Role entry points let Admins grant/revoke Admin, Manager and Executor roles; the final Admin cannot be removed.

## Contract V2 status

**Contract V2 implemented and locally tested. Not yet deployed to Casper Testnet.**

Roles are checked on-chain using caller account hashes. Caller identities and timestamps are sourced by the runtime, never accepted from the frontend. Audit records are stored in a sequenced dictionary for business and role changes. The install action itself does not emit an audit row because the contract dictionary context is not active until installation completes.

The upgraded contract source/Wasm is **not automatically deployed**. Existing hashes in `CASPER_TESTNET_PROOF.md` refer to the earlier proof-only contract. Deploy the upgraded Wasm and update `NEXT_PUBLIC_CASPER_CONTRACT_HASH` before demonstrating the new on-chain state machine.

This project records approval and payment-proof evidence only. It does not transfer CSPR/tokens, settle vendors or implement escrow.
