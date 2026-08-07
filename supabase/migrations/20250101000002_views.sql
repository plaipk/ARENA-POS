-- Read-only views backing the POS header balance and the debtors dialog.
-- security_invoker so RLS on the underlying tables still applies per-caller
-- (without it, a view runs with its owner's rights and would bypass RLS).

create view public.v_balance_summary
with (security_invoker = true) as
select
  coalesce(sum(income - expense) filter (where payment_method = 'cash'), 0) as cash,
  coalesce(sum(income - expense) filter (where payment_method = 'transfer'), 0) as transfer
from public.transactions
where not is_void;

create view public.v_debtor_summary
with (security_invoker = true) as
select customer_name as name, sum(remaining_amount) as total
from public.debts
where status in ('outstanding', 'partial')
group by customer_name
having sum(remaining_amount) > 0
order by customer_name;
