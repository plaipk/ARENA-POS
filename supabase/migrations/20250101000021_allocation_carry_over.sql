-- next_balance of one period didn't match prev_balance of the next.
--
-- A period's own allocation (total_out) is subtracted in ITS report, but
-- the actual profit_allocation withdrawal is dated when the period gets
-- closed — i.e. inside the NEXT period. prev_balance (every transaction
-- before the period start) doesn't contain it yet, and total_expense skips
-- the profit_allocation category, so that withdrawal was never subtracted
-- anywhere in the next period's chain. Each report's next_balance came out
-- too high by the previous period's allocation (Sep +172, Oct +1,554).
--
-- prev_balance now leaves the profit_allocation transactions out and
-- subtracts the total_out of every period closed before this one instead,
-- so allocations land in the period they belong to, exactly once.
--
-- Same body as 20250101000020_no_negative_allocation.sql otherwise.

create or replace function public.get_report_by_month(p_month int, p_year int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := ((make_date(p_year, p_month, 1) - interval '1 month') + interval '25 days') at time zone 'Asia/Bangkok';
  v_end timestamptz := (make_date(p_year, p_month, 25) + interval '1 day' - interval '1 second') at time zone 'Asia/Bangkok';
  v_period text := to_char((make_date(p_year, p_month, 1) - interval '1 month') + interval '25 days', 'DD/MM/YY')
                   || ' - ' || to_char(make_date(p_year, p_month, 25), 'DD/MM/YY');
  v_rent_income numeric;
  v_misc_income numeric;
  v_product_sales numeric;
  v_profit_from_sales numeric;
  v_other_income jsonb;
  v_general_expenses jsonb;
  v_stock_expense numeric;
  v_actual_expense numeric;
  v_total_income numeric;
  v_total_expense numeric;
  v_total_debt numeric;
  v_stock_value numeric;
  v_reserve_balance numeric;
  v_prev_balance numeric;
  v_net_profit numeric;
  v_scholarship numeric;
  v_emergency numeric;
  v_rotate numeric;
  v_staff numeric;
  v_total_out numeric;
  v_next_balance numeric;
begin
  select coalesce(sum(income), 0) into v_rent_income
  from public.transactions
  where category = 'field_rental' and not is_void and occurred_at between v_start and v_end;

  select coalesce(sum(income), 0) into v_misc_income
  from public.transactions
  where category = 'other_income' and not is_void and occurred_at between v_start and v_end;

  select coalesce(sum(income), 0), coalesce(sum(profit_total), 0) into v_product_sales, v_profit_from_sales
  from public.transactions
  where category in ('product_sale', 'debt_settlement', 'other_income')
    and not is_void and occurred_at between v_start and v_end;

  v_product_sales := v_product_sales - v_misc_income;

  select coalesce(jsonb_agg(jsonb_build_object('name', detail, 'amount', income) order by occurred_at), '[]'::jsonb)
    into v_other_income
  from public.transactions
  where category in ('field_rental', 'other_income') and not is_void and occurred_at between v_start and v_end;

  select coalesce(jsonb_agg(jsonb_build_object('name', detail, 'amount', expense) order by occurred_at), '[]'::jsonb)
    into v_general_expenses
  from public.transactions
  where category = 'general_expense' and not is_void and occurred_at between v_start and v_end;

  select coalesce(sum(expense), 0) into v_stock_expense
  from public.transactions
  where category = 'stock_purchase' and not is_void and occurred_at between v_start and v_end;

  select coalesce(sum(expense), 0) into v_actual_expense
  from public.transactions
  where category = 'general_expense' and not is_void and occurred_at between v_start and v_end;

  v_total_income := v_rent_income + v_misc_income + v_product_sales;
  v_total_expense := v_stock_expense + v_actual_expense;

  select coalesce(sum(remaining_amount), 0) into v_total_debt
  from public.debts where status in ('outstanding', 'partial');

  select coalesce(sum(stock * cost), 0) into v_stock_value from public.products;
  select coalesce(sum(amount), 0) into v_reserve_balance from public.reserve_fund_entries;

  select coalesce(sum(income - expense), 0) into v_prev_balance
  from public.transactions
  where not is_void and category <> 'profit_allocation' and occurred_at < v_start;

  v_prev_balance := v_prev_balance - (
    select coalesce(sum(total_out), 0) from public.profit_allocations
    where year * 12 + month < p_year * 12 + p_month
  );

  v_net_profit := floor(v_rent_income + v_profit_from_sales - v_actual_expense);
  if v_net_profit > 0 then
    v_scholarship := floor(v_net_profit * 0.3);
    v_emergency := floor(v_net_profit * 0.3);
    v_rotate := floor(v_net_profit * 0.3);
    v_staff := floor(v_net_profit * 0.1);
  else
    v_scholarship := 0;
    v_emergency := 0;
    v_rotate := 0;
    v_staff := 0;
  end if;
  v_total_out := v_scholarship + v_emergency + v_staff;
  v_next_balance := v_prev_balance + v_total_income - v_total_expense - v_total_out;

  return jsonb_build_object(
    'period', v_period,
    'rent_income_total', v_rent_income,
    'product_sales_total', v_product_sales,
    'total_profit_from_sales', v_profit_from_sales,
    'other_income_items', v_other_income,
    'general_expenses', v_general_expenses,
    'stock_expense', v_stock_expense,
    'actual_expense', v_actual_expense,
    'total_income', v_total_income,
    'total_expense', v_total_expense,
    'total_debt', v_total_debt,
    'stock_value', v_stock_value,
    'reserve_balance', v_reserve_balance,
    'prev_balance', v_prev_balance,
    'next_balance', v_next_balance,
    'alloc', jsonb_build_object(
      'net_profit', v_net_profit,
      'scholarship', v_scholarship,
      'emergency', v_emergency,
      'rotate', v_rotate,
      'staff', v_staff,
      'total_out', v_total_out
    )
  );
end;
$$;
