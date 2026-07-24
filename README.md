# Casper Invoice Agent

Casper Invoice Agent is an AI-assisted accounts-payable workflow that processes real invoice PDFs, extracts structured data with Gemini, applies deterministic risk and compliance rules, requires human approval, and anchors immutable approval and payment-proof records on Casper Testnet.

The current version focuses on:

- Real PDF ingestion and text extraction
- Schema-validated Gemini invoice extraction
- Autonomous risk and compliance decisions
- Persistent invoice and execution state in SQLite
- Human-approved Casper transactions
- On-chain RBAC and invoice lifecycle enforcement
- Verifiable approval and payment-proof evidence

> Important: this project does not transfer CSPR, USDC or other tokens to vendors and does not implement escrow. In Contract V2, `PAID` means that an approved payment-proof record has been anchored on Casper.

---

## Problem

Business invoice processing is often fragmented across email, PDF files, spreadsheets and manual approval workflows.

This creates several risks:

- Duplicate invoices
- Duplicate files with modified names
- Abnormal invoice amounts
- Vendor wallet mismatches
- Missing required fields
- Payments above company limits
- Weak audit trails
- Approval records that can be modified later

Casper Invoice Agent combines document intelligence, deterministic risk rules, human approval and tamper-resistant on-chain evidence.

---

## Solution

The workflow is:

```text
Upload PDF
→ Extract text
→ Gemini structured extraction
→ Zod validation
→ Risk Agent evaluation
→ SQLite persistence
→ Human approval
→ Casper Wallet signature
→ Casper execution confirmation
→ Contract state readback
→ UI confirmation

## License

This project is licensed under the MIT License.
See the [LICENSE](LICENSE) file for details.
