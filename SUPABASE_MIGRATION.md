# Supabase migration steps

1. Install dependencies:

```bash
npm install @supabase/supabase-js pdf-parse@1.1.1
```

2. In Supabase SQL Editor, run in this order:

```text
supabase/schema.sql
supabase/storage.sql
```

3. Add these variables to `.env.local` and Vercel Production/Preview:

```env
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_INVOICE_BUCKET=invoices
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never add `NEXT_PUBLIC_` to it and never commit it.

4. Keep the existing Gemini and Casper variables.

5. Restart local development and redeploy Vercel after setting environment variables.

6. The old `data/runtime/` SQLite database and `data/uploads/` folder are no longer used by these routes. They may remain ignored for archival/local backup purposes.

## Verification

```bash
npm run lint
npm test
npm run build
npm run test:contract
```

Then start the app and verify `GET /api/invoices`. Upload accepts only a PDF up to 10 MB whose bytes start with `%PDF-`. Analysis downloads the private object, extracts text, calls Gemini, validates the structured response, runs deterministic risk checks, and persists the result.

For Vercel, add every variable to the appropriate Production and Preview environments, run both SQL files before deploying, and do not expose the service-role key to the browser. The API routes use the Node runtime because PDF parsing depends on a native server package.

## Important

- Supabase fixes persistent database and PDF storage on Vercel.
- `pdf-parse` 1.1.1 performs server-side text extraction without browser workers or native canvas.
- The Storage bucket is private. PDF files are never exposed through a public URL by this implementation.
- `PAID` means that an approved payment proof was anchored on Casper. This application does not transfer tokens, settle with a vendor, or release escrow.
- Execution success is not sufficient by itself: the application reads the Contract V2 proposal dictionary and only persists the expected state after that reconciliation succeeds.
