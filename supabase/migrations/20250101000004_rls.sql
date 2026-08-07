-- No accounts, so there's no "authenticated" role to gate on — the app talks
-- to Supabase using only the public anon key. RLS here still does one useful
-- job: everyone can SELECT, but nobody (not even anon) has an INSERT/UPDATE/
-- DELETE policy on any table, so raw table writes are impossible from the
-- client. The only way to mutate anything is through the SECURITY DEFINER
-- functions in 20250101000003_functions.sql, which run as their owner and
-- therefore bypass RLS for their own internal writes.

alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;
alter table public.debt_payment_allocations enable row level security;
alter table public.reserve_fund_entries enable row level security;
alter table public.profit_allocations enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;

create policy "products_select" on public.products
  for select to anon, authenticated using (true);

create policy "transactions_select" on public.transactions
  for select to anon, authenticated using (true);

create policy "debts_select" on public.debts
  for select to anon, authenticated using (true);

create policy "debt_payments_select" on public.debt_payments
  for select to anon, authenticated using (true);

create policy "reserve_fund_entries_select" on public.reserve_fund_entries
  for select to anon, authenticated using (true);

create policy "profit_allocations_select" on public.profit_allocations
  for select to anon, authenticated using (true);

create policy "reports_select" on public.reports
  for select to anon, authenticated using (true);

create policy "audit_log_select" on public.audit_log
  for select to anon, authenticated using (true);

-- Table grants: PostgREST still checks these before RLS even runs, so `anon`
-- needs SELECT on every table/view it's allowed to read, and EXECUTE on
-- every RPC function above.
grant usage on schema public to anon, authenticated;
grant select on
  public.products, public.transactions, public.debts,
  public.debt_payments, public.reserve_fund_entries, public.profit_allocations,
  public.reports, public.audit_log, public.v_balance_summary, public.v_debtor_summary
to anon, authenticated;

grant execute on function
  public.save_transaction(jsonb, text, text, text),
  public.settle_debt(text, numeric, text),
  public.void_transaction(uuid, text),
  public.void_debt(uuid, text),
  public.transfer_funds(text, numeric),
  public.search_transactions_by_date(date),
  public.get_report_by_month(int, int),
  public.get_report_archive(int),
  public.save_allocation_entry(int, int)
to anon, authenticated;
