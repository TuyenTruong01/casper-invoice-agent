# Casper Invoice Agent

AI-powered Accounts Payable workflow for the Casper Agentic Buildathon.

## MVP
- 50 synthetic vendor invoice PDFs in `public/invoices`
- Whitelisted Casper public keys
- Roles: Admin, Manager, Employee
- AI analysis mock that creates a payment proposal
- Manager approval flow
- Payment proof mock transaction log
- Wallet Management module in Settings

## Run locally

```bash
cd "/d/Tuyen_Lam viec/02 Web Hackathon/02 Casper/casper-invoice-agent-v5"
npm install
npm run dev
```

Open `http://localhost:3000`.

## Demo wallets

- Admin: `020290622992011fd65e6fece166b275c8414bd0983f3542635c4c09916d5bca8bf8`
- Manager: `02021b723610797a778fb372b610ca70ce2a7ec675bf5e631920c4b155ed96a71942`
- Employee: `02020a4ddd31f32b08d607f8013ec80bca8ecf73090fa163eab9c93da2d099ca264e`
- Judge Demo: `0202429fc3d574475d62bebf3e66e85fc88e251c8884608173bf766f77acdd518c04`

## Next step
Replace the mock payment proof with real Casper Testnet contract calls.
