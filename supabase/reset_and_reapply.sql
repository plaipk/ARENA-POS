-- Run this ONCE to wipe the previous (auth-based) schema attempt and replace
-- it with the no-login version. Safe to run even if nothing exists yet.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists public.audit_log cascade;
drop table if exists public.reports cascade;
drop table if exists public.reserve_fund_entries cascade;
drop table if exists public.profit_allocations cascade;
drop table if exists public.debt_payment_allocations cascade;
drop table if exists public.debt_payments cascade;
drop table if exists public.debts cascade;
drop table if exists public.transactions cascade;
drop table if exists public.products cascade;
drop table if exists public.profiles cascade;

drop view if exists public.v_balance_summary;
drop view if exists public.v_debtor_summary;

drop function if exists public.is_admin();
drop function if exists public.save_transaction(jsonb, text, text, text);
drop function if exists public.settle_debt(text, numeric, text);
drop function if exists public.void_transaction(uuid, text);
drop function if exists public.void_debt(uuid, text);
drop function if exists public.transfer_funds(text, numeric);
drop function if exists public.search_transactions_by_date(date);
drop function if exists public.get_report_by_month(int, int);
drop function if exists public.get_report_archive(int);
drop function if exists public.save_allocation_entry(int, int);

-- (the storage bucket itself is left alone — Supabase blocks direct DELETEs
-- on storage tables; 0005_storage.sql re-inserts it with ON CONFLICT DO
-- NOTHING, which is a no-op if it's already there)
drop policy if exists "reports_bucket_read" on storage.objects;
