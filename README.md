# ARENA POS Pro

POS + accounting system for a football-field operation: product sales, general
expenses, stock receiving, credit sales ("เซ็น") with partial-payment debt
tracking, cash↔bank transfers, an admin-only Void flow, and a monthly closing
report (26th–25th accounting period) that allocates net profit 30/30/30/10
and emits a PDF.

Rebuilt from the original Google Apps Script + Sheets version onto:
**Next.js** (App Router) · **Supabase** (Postgres, Auth, Storage) · **Vercel**.

## Stack notes

- All mutations go through **Postgres RPC functions** (`supabase/migrations/`),
  not application code — see the comments at the top of
  `20250101000003_functions.sql`. RLS denies direct table writes; the RPC
  functions are the only way in, and they do their own role checks (`void_*`
  and `save_allocation_entry` require `role = 'admin'` in `profiles`).
- `src/lib/types/database.ts` is hand-written to match the migrations. Every
  `Row`/`Insert`/`Update` type **must stay a fully inlined object literal** —
  see the comment in that file for why (a real, reproducible Supabase
  TypeScript client bug where referencing a named interface, or even the
  built-in `Partial<T>`, silently collapses `.rpc()`/`.from()` typing to
  `undefined`/`never`). Regenerating with `supabase gen types typescript`
  produces this same literal style, so that's always safe to run.

## Local setup

1. **Supabase project**: create one at supabase.com (or `supabase init` +
   `supabase start` for a local stack). Apply the migrations in
   `supabase/migrations/` in order — either `supabase db push`, or paste each
   file's contents into the SQL Editor in order (0001 → 0005).
2. `cp .env.local.example .env.local` and fill in the Supabase URL + keys
   (Project Settings → API).
3. `npm install`
4. `npm run dev` — [http://localhost:3000](http://localhost:3000)
5. There's no self-serve sign-up screen by design (this is a small operator
   team, not a public app). Create the first user from the Supabase dashboard
   (Authentication → Users → Add user), then promote them to admin:
   ```sql
   update public.profiles set role = 'admin' where id = '<their-uuid>';
   ```
   Everyone else stays `staff` by default (can sell, settle debts, transfer
   funds, view reports) until an admin promotes them too.

## Migrating the old Google Sheet data

See the header comment in `scripts/migrate-from-sheets.ts` for the Google
service-account setup, then:

```bash
npm run migrate
```

Run it against a staging/throwaway Supabase project first and spot-check
totals against the original sheet before pointing it at production.

## Deploying

- **Vercel**: import the GitHub repo, set the same env vars from
  `.env.local` (except the `GOOGLE_*` ones — those are only for the one-off
  migration script) in the Vercel project settings.
- The `/api/reports/generate` route needs the Node.js runtime (already set
  via `export const runtime = "nodejs"`) — it renders PDFs with
  `@react-pdf/renderer` and uploads them to the private `reports` Storage
  bucket using the service-role key.
