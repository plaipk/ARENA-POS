-- Bug found while re-importing real ledger data: get_report_by_month() and
-- get_report_archive() built the 26th–25th period boundary with
-- make_date(...) (timezone-naive), which Postgres then compares against
-- `occurred_at` (timestamptz) using the DATABASE SESSION's timezone (UTC on
-- Supabase) — not Thailand's. A sale made between 00:00–06:59 Bangkok time
-- on the 26th (17:00–23:59 UTC on the 25th) landed inside that UTC window
-- and got counted in the WRONG (previous) month's report and profit
-- allocation. `at time zone 'Asia/Bangkok'` on the naive timestamp forces
-- it to be interpreted as Bangkok wall-clock time before converting to the
-- UTC instant actually stored in `occurred_at`.

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
  from public.transactions where not is_void and occurred_at < v_start;

  v_net_profit := floor(v_rent_income + v_profit_from_sales - v_actual_expense);
  v_scholarship := floor(v_net_profit * 0.3);
  v_emergency := floor(v_net_profit * 0.3);
  v_rotate := floor(v_net_profit * 0.3);
  v_staff := floor(v_net_profit * 0.1);
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

create or replace function public.get_report_archive(p_year int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month int;
  v_report jsonb;
  v_meta jsonb;
  v_alloc record;
  v_report_row record;
  v_pdf_versions jsonb;
  v_row_count int;
  v_start timestamptz;
  v_end timestamptz;
  v_month_names text[] := array[
    '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  v_out jsonb := '[]'::jsonb;
begin
  for v_month in 1..12 loop
    v_report := public.get_report_by_month(v_month, p_year);
    v_start := ((make_date(p_year, v_month, 1) - interval '1 month') + interval '25 days') at time zone 'Asia/Bangkok';
    v_end := (make_date(p_year, v_month, 25) + interval '1 day' - interval '1 second') at time zone 'Asia/Bangkok';

    select count(*) into v_row_count
    from public.transactions
    where not is_void and occurred_at between v_start and v_end
      and category not in ('transfer', 'profit_allocation');

    select * into v_alloc from public.profit_allocations where month = v_month and year = p_year;
    select * into v_report_row from public.reports
      where month = v_month and year = p_year order by created_at desc limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'storage_path', storage_path,
        'file_name', file_name,
        'created_at', to_char(created_at, 'DD/MM/YYYY HH24:MI')
      ) order by created_at desc), '[]'::jsonb)
      into v_pdf_versions
    from public.reports
    where month = v_month and year = p_year;

    v_meta := jsonb_build_object(
      'month', v_month,
      'month_name', v_month_names[v_month + 1],
      'row_count', v_row_count,
      'allocated', (v_alloc.id is not null),
      'alloc_date', case when v_alloc.id is not null then to_char(v_alloc.created_at, 'DD/MM/YYYY') else null end,
      'has_pdf', (v_report_row.id is not null),
      'storage_path', v_report_row.storage_path,
      'pdf_created_at', case when v_report_row.id is not null
        then to_char(v_report_row.created_at, 'DD/MM/YYYY HH24:MI') else null end,
      'pdf_versions', v_pdf_versions
    );

    v_out := v_out || (v_meta || v_report);
  end loop;

  return v_out;
end;
$$;
