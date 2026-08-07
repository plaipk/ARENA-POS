-- RLS: authenticated users can SELECT operational tables. No INSERT/UPDATE/
-- DELETE policy is granted to anon/authenticated on any of them — every
-- mutation is only reachable through the SECURITY DEFINER functions in
-- 20250101000003_functions.sql, which run as their owner and therefore
-- bypass RLS for their own internal writes, after doing their own auth/role
-- checks. This is what makes the RPC layer the single, unbypassable gate.

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;
alter table public.debt_payment_allocations enable row level security;
alter table public.reserve_fund_entries enable row level security;
alter table public.profit_allocations enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "products_select" on public.products
  for select to authenticated using (true);

create policy "transactions_select" on public.transactions
  for select to authenticated using (true);

create policy "debts_select" on public.debts
  for select to authenticated using (true);

create policy "debt_payments_select" on public.debt_payments
  for select to authenticated using (true);

create policy "reserve_fund_entries_select" on public.reserve_fund_entries
  for select to authenticated using (true);

create policy "profit_allocations_select" on public.profit_allocations
  for select to authenticated using (true);

create policy "reports_select" on public.reports
  for select to authenticated using (true);

-- audit_log and the debt-payment-allocation ledger are admin/internal only —
-- no policy at all for regular staff (RLS default-denies without one).
create policy "audit_log_select_admin" on public.audit_log
  for select to authenticated using (public.is_admin());

-- Table grants: PostgREST still checks these before RLS even runs, so
-- `authenticated` needs SELECT on the tables/views it's allowed to read,
-- and EXECUTE on every RPC function above.
grant usage on schema public to authenticated;
grant select on
  public.profiles, public.products, public.transactions, public.debts,
  public.debt_payments, public.reserve_fund_entries, public.profit_allocations,
  public.reports, public.audit_log, public.v_balance_summary, public.v_debtor_summary
to authenticated;

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
to authenticated;
