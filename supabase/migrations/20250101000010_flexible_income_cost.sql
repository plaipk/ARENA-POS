-- Replaces the "รายการอื่นๆ" checkbox approach (migration 000009) with
-- something simpler: no flag at all. In income mode, if the typed name
-- doesn't match a real product, the client just supplies a cost per unit
-- for that line instead of being blocked. Profit for that line = total -
-- cost, computed and stored exactly like a normal product sale — so
-- whether it ends up counting toward net_profit (the 30/30/30/10 pool) is
-- entirely up to the cost typed in, no special-casing needed:
--   - "ยอดยกมา": cost = price -> profit 0 -> doesn't move net_profit at all
--   - "ค่าเช่าสนาม" (no matching product): cost = 0 -> profit = full price
--     -> counts in full, same effect as a real field_rental product
-- category stays 'other_income' purely so these lines keep showing up in
-- the report's itemized "other income" list instead of getting lumped into
-- "รายได้ขายสินค้า" — but its profit now DOES feed net_profit (reversing
-- migration 000009's exclusion).

create or replace function public.save_transaction(
  p_cart jsonb,
  p_payment_type text,
  p_customer_name text,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_name text;
  v_qty numeric;
  v_total numeric;
  v_cost_per_unit numeric;
  v_detail text;
  v_missing text[] := '{}';
  v_product record;
  v_cost_total numeric;
  v_profit numeric;
begin
  if p_cart is null or jsonb_array_length(p_cart) = 0 then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่มีรายการในตะกร้า');
  end if;
  if p_mode not in ('income', 'expense', 'stock_in') then
    return jsonb_build_object('ok', false, 'message', '❌ โหมดการทำงานไม่ถูกต้อง');
  end if;
  if p_payment_type not in ('เงินสด', 'โอน', 'เซ็น') then
    return jsonb_build_object('ok', false, 'message', '❌ ประเภทการชำระไม่ถูกต้อง');
  end if;
  if p_mode <> 'income' and p_payment_type = 'เซ็น' then
    return jsonb_build_object('ok', false, 'message', '❌ โหมดนี้ไม่รองรับการเซ็น กรุณาเลือกเงินสดหรือโอน');
  end if;
  if p_payment_type = 'เซ็น' and coalesce(trim(p_customer_name), '') = '' then
    return jsonb_build_object('ok', false, 'message', '❌ กรุณาระบุชื่อผู้เซ็น');
  end if;

  -- validate every line before touching any table (matches the original's [9])
  for v_item in select * from jsonb_array_elements(p_cart)
  loop
    v_name := trim(v_item ->> 'name');
    v_qty := (v_item ->> 'qty')::numeric;
    v_total := (v_item ->> 'total')::numeric;
    if coalesce(v_name, '') = '' then
      return jsonb_build_object('ok', false, 'message', '❌ มีรายการที่ไม่มีชื่อสินค้า');
    end if;
    if v_qty is null or v_qty <= 0 then
      return jsonb_build_object('ok', false, 'message', format('❌ ''%s'' จำนวนต้องมากกว่า 0', v_name));
    end if;
    if v_total is null or v_total < 0 then
      return jsonb_build_object('ok', false, 'message', format('❌ ''%s'' ยอดเงินไม่ถูกต้อง', v_name));
    end if;
  end loop;

  -- stock_in must always match a real product (it's receiving inventory —
  -- there's nothing to "receive" for an item that doesn't exist). income
  -- items that don't match a product are allowed through IF a cost was
  -- supplied; reject only if it's missing/invalid, so a plain typo of a
  -- real product's name still gets caught (matches the original's [10]).
  for v_item in select * from jsonb_array_elements(p_cart)
  loop
    v_name := trim(v_item ->> 'name');
    if exists (select 1 from public.products where lower(name) = lower(v_name)) then
      continue;
    end if;
    if p_mode = 'stock_in' then
      v_missing := array_append(v_missing, v_name);
    elsif p_mode = 'income' then
      if (v_item ->> 'cost') is null or (v_item ->> 'cost')::numeric < 0 then
        return jsonb_build_object(
          'ok', false,
          'message', format('❌ ''%s'' ไม่พบในระบบสินค้า กรุณาใส่ต้นทุนของรายการนี้ก่อนบันทึก', v_name)
        );
      end if;
    end if;
  end loop;
  if array_length(v_missing, 1) > 0 then
    return jsonb_build_object(
      'ok', false,
      'message', '❌ ไม่พบสินค้าเหล่านี้ในระบบ: ' || array_to_string(v_missing, ', ') ||
        E'\n\nกรุณาเพิ่มสินค้าก่อน (ระบบไม่บันทึกทั้งบิล เพื่อไม่ให้สต็อกกับต้นทุนเพี้ยน)'
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_cart)
  loop
    v_name := trim(v_item ->> 'name');
    v_qty := (v_item ->> 'qty')::numeric;
    v_total := (v_item ->> 'total')::numeric;

    if p_mode = 'income' then
      select * into v_product from public.products where lower(name) = lower(v_name) for update;

      if found then
        -- [2] cost is always read from `products` here, server-side — never trust the client.
        v_cost_total := v_product.cost * v_qty;
        v_profit := v_total - v_cost_total;
        v_detail := v_name || ' (' || v_qty || ')';

        if p_payment_type = 'เซ็น' then
          insert into public.debts (
            customer_name, product_id, product_name, qty, detail,
            amount, cost_total, profit_total, remaining_amount, remaining_cost, remaining_profit
          ) values (
            trim(p_customer_name), v_product.id, v_name, v_qty, v_detail,
            v_total, v_cost_total, v_profit, v_total, v_cost_total, v_profit
          );
        else
          insert into public.transactions (
            product_id, product_name, qty, unit_price, detail, income, expense,
            cost_total, profit_total, payment_method, category, mode
          ) values (
            v_product.id, v_name, v_qty, v_total / nullif(v_qty, 0), v_detail, v_total, 0,
            v_cost_total, v_profit,
            case when p_payment_type = 'เงินสด' then 'cash' else 'transfer' end,
            case when v_product.category = 'field_rental' then 'field_rental' else 'product_sale' end,
            'income'
          );
        end if;

        -- [15] stock is cut once, right here, at time of sale — settling a
        -- credit sale later never touches stock again.
        update public.products set stock = stock - v_qty, updated_at = now() where id = v_product.id;
      else
        -- not a registered product: client-supplied cost per unit, same
        -- profit math as above, no stock to touch.
        v_cost_per_unit := (v_item ->> 'cost')::numeric;
        v_cost_total := v_cost_per_unit * v_qty;
        v_profit := v_total - v_cost_total;
        v_detail := v_name;

        if p_payment_type = 'เซ็น' then
          insert into public.debts (
            customer_name, product_id, product_name, qty, detail,
            amount, cost_total, profit_total, remaining_amount, remaining_cost, remaining_profit
          ) values (
            trim(p_customer_name), null, null, null, v_detail,
            v_total, v_cost_total, v_profit, v_total, v_cost_total, v_profit
          );
        else
          insert into public.transactions (
            product_id, product_name, qty, unit_price, detail, income, expense,
            cost_total, profit_total, payment_method, category, mode
          ) values (
            null, null, null, v_total / nullif(v_qty, 0), v_detail, v_total, 0,
            v_cost_total, v_profit,
            case when p_payment_type = 'เงินสด' then 'cash' else 'transfer' end,
            'other_income', 'income'
          );
        end if;
      end if;

    elsif p_mode = 'expense' then
      v_detail := v_name || ' [จ่าย]';
      insert into public.transactions (detail, income, expense, payment_method, category, mode)
      values (
        v_detail, 0, v_total,
        case when p_payment_type = 'เงินสด' then 'cash' else 'transfer' end,
        'general_expense', 'expense'
      );

    else -- stock_in
      select * into v_product from public.products where lower(name) = lower(v_name) for update;
      v_detail := v_name || ' [รับเข้า ' || v_qty || ']';
      insert into public.transactions (
        product_id, product_name, qty, detail, income, expense, payment_method, category, mode
      ) values (
        v_product.id, v_name, v_qty, v_detail, 0, v_total,
        case when p_payment_type = 'เงินสด' then 'cash' else 'transfer' end,
        'stock_purchase', 'stock_in'
      );
      update public.products set stock = stock + v_qty, updated_at = now() where id = v_product.id;
    end if;
  end loop;

  insert into public.audit_log (action, detail, amount, mode)
  select
    'บันทึกรายการ (' || p_mode || ')',
    (select string_agg(trim(elem ->> 'name'), ', ') from jsonb_array_elements(p_cart) elem) ||
      case when p_payment_type = 'เซ็น' then ' | เซ็น:' || p_customer_name else '' end,
    (select sum((elem ->> 'total')::numeric) from jsonb_array_elements(p_cart) elem),
    p_payment_type;

  return jsonb_build_object('ok', true, 'message', '✅ บันทึกข้อมูลสำเร็จ!');
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

-- ============================================================
-- get_report_by_month — other_income's profit now feeds net_profit (its
-- profit_total is whatever "total - cost" the item was entered with, so a
-- carry-forward line entered at cost=price still contributes 0).
-- ============================================================
create or replace function public.get_report_by_month(p_month int, p_year int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := (make_date(p_year, p_month, 1) - interval '1 month') + interval '25 days';
  v_end timestamptz := make_date(p_year, p_month, 25) + interval '1 day' - interval '1 second';
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

  -- (v_product_sales intentionally keeps other_income OUT — that revenue is
  -- shown itemized below, not lumped into "รายได้ขายสินค้า" — while
  -- v_profit_from_sales above deliberately includes it, since that's the
  -- number that feeds net_profit.)
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
