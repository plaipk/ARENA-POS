-- RPC functions — mirror the original Code.gs functions 1:1. Every mutation
-- the app performs goes through one of these (RLS denies direct table
-- writes; see 20250101000004_rls.sql), which is what replaces
-- LockService.getScriptLock(): each function body runs inside one Postgres
-- transaction, and `for update` row locks serialize concurrent writers to
-- the same product/debt rows instead of one single global lock.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ============================================================
-- save_transaction — sell / general expense / stock receiving.
-- ============================================================
create or replace function public.save_transaction(
  p_cart jsonb,
  p_payment_type text, -- 'เงินสด' | 'โอน' | 'เซ็น'
  p_customer_name text,
  p_mode text -- 'income' | 'expense' | 'stock_in'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_name text;
  v_qty numeric;
  v_total numeric;
  v_detail text;
  v_missing text[] := '{}';
  v_product record;
  v_cost_total numeric;
  v_profit numeric;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'ไม่ได้เข้าสู่ระบบ');
  end if;
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

  -- income/stock_in must match a real product (matches the original's [10]:
  -- reject the whole cart rather than write silently with a missing item)
  if p_mode in ('income', 'stock_in') then
    for v_item in select * from jsonb_array_elements(p_cart)
    loop
      v_name := trim(v_item ->> 'name');
      if not exists (select 1 from public.products where lower(name) = lower(v_name)) then
        v_missing := array_append(v_missing, v_name);
      end if;
    end loop;
    if array_length(v_missing, 1) > 0 then
      return jsonb_build_object(
        'ok', false,
        'message', '❌ ไม่พบสินค้าเหล่านี้ในระบบ: ' || array_to_string(v_missing, ', ') ||
          E'\n\nกรุณาเพิ่มสินค้าก่อน (ระบบไม่บันทึกทั้งบิล เพื่อไม่ให้สต็อกกับต้นทุนเพี้ยน)'
      );
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_cart)
  loop
    v_name := trim(v_item ->> 'name');
    v_qty := (v_item ->> 'qty')::numeric;
    v_total := (v_item ->> 'total')::numeric;

    if p_mode = 'income' then
      -- [2] cost is always read from `products` here, server-side — never trust the client.
      select * into v_product from public.products where lower(name) = lower(v_name) for update;
      v_cost_total := v_product.cost * v_qty;
      v_profit := v_total - v_cost_total;
      v_detail := v_name || ' (' || v_qty || ')';

      if p_payment_type = 'เซ็น' then
        insert into public.debts (
          customer_name, product_id, product_name, qty, detail,
          amount, cost_total, profit_total, remaining_amount, remaining_cost, remaining_profit, created_by
        ) values (
          trim(p_customer_name), v_product.id, v_name, v_qty, v_detail,
          v_total, v_cost_total, v_profit, v_total, v_cost_total, v_profit, v_uid
        );
      else
        insert into public.transactions (
          product_id, product_name, qty, unit_price, detail, income, expense,
          cost_total, profit_total, payment_method, category, mode, created_by
        ) values (
          v_product.id, v_name, v_qty, v_total / nullif(v_qty, 0), v_detail, v_total, 0,
          v_cost_total, v_profit,
          case when p_payment_type = 'เงินสด' then 'cash' else 'transfer' end,
          case when v_product.category = 'field_rental' then 'field_rental' else 'product_sale' end,
          'income', v_uid
        );
      end if;

      -- [15] stock is cut once, right here, at time of sale — settling a
      -- credit sale later never touches stock again.
      update public.products set stock = stock - v_qty, updated_at = now() where id = v_product.id;

    elsif p_mode = 'expense' then
      v_detail := v_name || ' [จ่าย]';
      insert into public.transactions (detail, income, expense, payment_method, category, mode, created_by)
      values (
        v_detail, 0, v_total,
        case when p_payment_type = 'เงินสด' then 'cash' else 'transfer' end,
        'general_expense', 'expense', v_uid
      );

    else -- stock_in
      select * into v_product from public.products where lower(name) = lower(v_name) for update;
      v_detail := v_name || ' [รับเข้า ' || v_qty || ']';
      insert into public.transactions (
        product_id, product_name, qty, detail, income, expense, payment_method, category, mode, created_by
      ) values (
        v_product.id, v_name, v_qty, v_detail, 0, v_total,
        case when p_payment_type = 'เงินสด' then 'cash' else 'transfer' end,
        'stock_purchase', 'stock_in', v_uid
      );
      update public.products set stock = stock + v_qty, updated_at = now() where id = v_product.id;
    end if;
  end loop;

  insert into public.audit_log (actor_id, action, detail, amount, mode)
  select
    v_uid,
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
-- settle_debt — FIFO oldest-first allocation across a customer's
-- outstanding debts, proportional cost/profit split on a partially-paid row.
-- ============================================================
create or replace function public.settle_debt(
  p_customer_name text,
  p_pay_amount numeric,
  p_payment_type text -- 'cash' | 'transfer'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target text := trim(p_customer_name);
  v_total_debt numeric;
  v_remain numeric;
  v_row record;
  v_cost_accum numeric := 0;
  v_profit_accum numeric := 0;
  v_txn_id uuid;
  v_payment_id uuid;
  v_consume numeric;
  v_ratio numeric;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'ไม่ได้เข้าสู่ระบบ');
  end if;
  if v_target = '' then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่ได้ระบุชื่อลูกหนี้');
  end if;
  if p_pay_amount is null or p_pay_amount <= 0 then
    return jsonb_build_object('ok', false, 'message', '❌ ยอดชำระต้องมากกว่า 0');
  end if;
  if p_payment_type not in ('cash', 'transfer') then
    return jsonb_build_object('ok', false, 'message', '❌ ประเภทการชำระไม่ถูกต้อง');
  end if;

  select coalesce(sum(remaining_amount), 0) into v_total_debt
  from public.debts where customer_name = v_target and status in ('outstanding', 'partial');

  if v_total_debt <= 0 then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่พบยอดค้างของ ' || v_target);
  end if;
  if p_pay_amount > v_total_debt + 0.005 then
    return jsonb_build_object(
      'ok', false,
      'message', format('❌ ยอดชำระ %s บาท เกินยอดค้างจริง %s บาท กรุณาแก้ไขยอดให้ถูกต้อง', p_pay_amount, v_total_debt)
    );
  end if;

  insert into public.debt_payments (customer_name, amount, payment_method, created_by)
  values (v_target, p_pay_amount, p_payment_type, v_uid)
  returning id into v_payment_id;

  v_remain := p_pay_amount;
  for v_row in
    select * from public.debts
    where customer_name = v_target and status in ('outstanding', 'partial')
    order by occurred_at asc, created_at asc
    for update
  loop
    exit when v_remain <= 0.005;

    if v_row.remaining_amount <= v_remain + 0.005 then
      v_consume := v_row.remaining_amount;
      v_cost_accum := v_cost_accum + v_row.remaining_cost;
      v_profit_accum := v_profit_accum + v_row.remaining_profit;
      insert into public.debt_payment_allocations (debt_payment_id, debt_id, amount, cost_part, profit_part)
      values (v_payment_id, v_row.id, v_consume, v_row.remaining_cost, v_row.remaining_profit);
      update public.debts
        set remaining_amount = 0, remaining_cost = 0, remaining_profit = 0, status = 'paid'
        where id = v_row.id;
      v_remain := v_remain - v_consume;
    else
      v_ratio := v_remain / v_row.remaining_amount;
      v_cost_accum := v_cost_accum + v_row.remaining_cost * v_ratio;
      v_profit_accum := v_profit_accum + v_row.remaining_profit * v_ratio;
      insert into public.debt_payment_allocations (debt_payment_id, debt_id, amount, cost_part, profit_part)
      values (v_payment_id, v_row.id, v_remain, v_row.remaining_cost * v_ratio, v_row.remaining_profit * v_ratio);
      update public.debts set
        remaining_amount = remaining_amount - v_remain,
        remaining_cost = remaining_cost - (remaining_cost * v_ratio),
        remaining_profit = remaining_profit - (remaining_profit * v_ratio),
        status = 'partial'
      where id = v_row.id;
      v_remain := 0;
    end if;
  end loop;

  insert into public.transactions (detail, income, expense, cost_total, profit_total, payment_method, category, mode, created_by)
  values (
    'รับชำระหนี้: ' || v_target, p_pay_amount, 0, floor(v_cost_accum), floor(v_profit_accum),
    p_payment_type, 'debt_settlement', 'settlement', v_uid
  )
  returning id into v_txn_id;

  update public.debt_payments
    set transaction_id = v_txn_id, cost_total = floor(v_cost_accum), profit_total = floor(v_profit_accum)
    where id = v_payment_id;

  insert into public.audit_log (actor_id, action, detail, amount, mode)
  values (v_uid, 'รับชำระหนี้', v_target, p_pay_amount, p_payment_type);

  return jsonb_build_object(
    'ok', true,
    'message', format('✅ บันทึกชำระเงิน %s บาท (ทุน: %s กำไร: %s) เรียบร้อย!', p_pay_amount, floor(v_cost_accum), floor(v_profit_accum))
  );
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

-- ============================================================
-- void_transaction / void_debt — admin-only (checked here, not just hidden
-- in the UI). Reproduce the original's conditional stock-return rules.
-- ============================================================
create or replace function public.void_transaction(p_transaction_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_txn record;
  v_alloc record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'ไม่ได้เข้าสู่ระบบ');
  end if;
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', '❌ เฉพาะแอดมินเท่านั้นที่ยกเลิกรายการได้');
  end if;

  select * into v_txn from public.transactions where id = p_transaction_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่พบรายการนี้');
  end if;
  if v_txn.is_void then
    return jsonb_build_object('ok', false, 'message', '❌ รายการนี้ถูกยกเลิกไปแล้ว');
  end if;

  if v_txn.category = 'profit_allocation' then
    select * into v_alloc from public.profit_allocations where transaction_id = v_txn.id;
    if found then
      delete from public.reserve_fund_entries where allocation_id = v_alloc.id;
      delete from public.profit_allocations where id = v_alloc.id;
    end if;

  elsif v_txn.category = 'debt_settlement' then
    -- matches the original's "คืนยอดจากการ Void": reopen the reversed amount as a fresh debt.
    insert into public.debts (
      customer_name, detail, amount, cost_total, profit_total,
      remaining_amount, remaining_cost, remaining_profit, status, created_by
    ) values (
      trim(replace(v_txn.detail, 'รับชำระหนี้:', '')),
      'คืนยอดจากการ Void',
      v_txn.income, v_txn.cost_total, v_txn.profit_total,
      v_txn.income, v_txn.cost_total, v_txn.profit_total,
      'outstanding', v_uid
    );

  elsif v_txn.category = 'product_sale' and v_txn.product_id is not null then
    update public.products set stock = stock + coalesce(v_txn.qty, 0), updated_at = now() where id = v_txn.product_id;

  elsif v_txn.category = 'stock_purchase' and v_txn.product_id is not null then
    update public.products set stock = stock - coalesce(v_txn.qty, 0), updated_at = now() where id = v_txn.product_id;
  end if;

  update public.transactions
    set is_void = true, void_reason = p_reason, voided_by = v_uid, voided_at = now()
    where id = p_transaction_id;

  insert into public.audit_log (actor_id, action, detail, amount, mode)
  values (v_uid, 'ลบรายการ (Void)', v_txn.detail, v_txn.income + v_txn.expense, 'void-main');

  return jsonb_build_object('ok', true, 'message', '✅ ลบรายการสำเร็จ!');
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

create or replace function public.void_debt(p_debt_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_debt record;
  v_stock_msg text := '';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'ไม่ได้เข้าสู่ระบบ');
  end if;
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', '❌ เฉพาะแอดมินเท่านั้นที่ยกเลิกรายการได้');
  end if;

  select * into v_debt from public.debts where id = p_debt_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่พบรายการนี้');
  end if;
  if v_debt.status in ('void', 'paid') then
    return jsonb_build_object('ok', false, 'message', '❌ รายการนี้ปิดไปแล้ว ไม่สามารถยกเลิกได้');
  end if;

  -- [15] unpaid credit sale voided -> stock returns; already partially paid ->
  -- the customer took the goods, so stock stays put and the remainder is a bad debt.
  if v_debt.status = 'partial' then
    v_stock_msg := ' (ไม่คืนสต็อก เพราะของออกไปตั้งแต่ตอนเซ็นและลูกค้าจ่ายมาบางส่วนแล้ว ยอดที่เหลือถือเป็นหนี้สูญ)';
  elsif v_debt.product_id is not null then
    update public.products set stock = stock + coalesce(v_debt.qty, 0), updated_at = now() where id = v_debt.product_id;
    v_stock_msg := format(' คืนสต็อก %s หน่วยเรียบร้อย', v_debt.qty);
  end if;

  update public.debts
    set status = 'void', remaining_amount = 0, remaining_cost = 0, remaining_profit = 0
    where id = p_debt_id;

  insert into public.audit_log (actor_id, action, detail, amount, mode)
  values (v_uid, 'ลบรายการค้างรับ (Void)', v_debt.detail, v_debt.remaining_amount, 'void-debt');

  return jsonb_build_object('ok', true, 'message', '✅ ลบรายการยอดค้างสำเร็จ!' || v_stock_msg);
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

-- ============================================================
-- transfer_funds — cash <-> bank, two offsetting ledger rows.
-- ============================================================
create or replace function public.transfer_funds(p_direction text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'ไม่ได้เข้าสู่ระบบ');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'message', 'จำนวนเงินต้องมากกว่า 0');
  end if;
  if p_direction not in ('cash_to_bank', 'bank_to_cash') then
    return jsonb_build_object('ok', false, 'message', 'รูปแบบการโยกเงินไม่ถูกต้อง');
  end if;

  if p_direction = 'cash_to_bank' then
    insert into public.transactions (detail, income, expense, payment_method, category, mode, created_by) values
      ('โยกเงิน (นำเงินสดเข้าบัญชี)', p_amount, 0, 'transfer', 'transfer', 'transfer', v_uid),
      ('โยกเงิน (นำเงินสดเข้าบัญชี)', 0, p_amount, 'cash', 'transfer', 'transfer', v_uid);
  else
    insert into public.transactions (detail, income, expense, payment_method, category, mode, created_by) values
      ('โยกเงิน (ถอนเงินโอนเป็นเงินสด)', p_amount, 0, 'cash', 'transfer', 'transfer', v_uid),
      ('โยกเงิน (ถอนเงินโอนเป็นเงินสด)', 0, p_amount, 'transfer', 'transfer', 'transfer', v_uid);
  end if;

  insert into public.audit_log (actor_id, action, detail, amount, mode)
  values (v_uid, 'โยกเงิน', p_direction, p_amount, 'transfer');

  return jsonb_build_object('ok', true, 'message', format('✅ โยกเงิน %s บาท สำเร็จ!', p_amount));
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

-- ============================================================
-- search_transactions_by_date — powers the Void dialog.
-- ============================================================
create or replace function public.search_transactions_by_date(p_date date)
returns table (id uuid, source text, detail text, amount numeric, type text, partial text)
language sql
stable
security definer
set search_path = public
as $$
  select id, source, detail, amount, type, partial from (
    select
      t.id, 'main'::text as source, t.detail, (t.income + t.expense) as amount,
      case t.payment_method when 'cash' then 'เงินสด' else 'โอน' end as type,
      null::text as partial,
      t.occurred_at as sort_ts
    from public.transactions t
    where t.occurred_at::date = p_date and not t.is_void

    union all

    select
      d.id, 'debt'::text, '[ค้าง] ' || d.detail, d.amount,
      'เซ็น: ' || d.customer_name,
      case when d.status = 'partial' then 'จ่ายบางส่วน' else null end,
      d.occurred_at
    from public.debts d
    where d.occurred_at::date = p_date and d.status <> 'void'
  ) combined
  order by sort_ts desc;
$$;

-- ============================================================
-- get_report_by_month — the fixed 26th–25th accounting period. Category
-- totals come straight from the `category` column, no substring matching.
-- Note: debt settlements are folded into product_sales_total (same as the
-- original, which treated "รับชำระหนี้:" rows as ordinary product income).
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

  select coalesce(sum(income), 0), coalesce(sum(profit_total), 0) into v_product_sales, v_profit_from_sales
  from public.transactions
  where category in ('product_sale', 'debt_settlement') and not is_void and occurred_at between v_start and v_end;

  select coalesce(jsonb_agg(jsonb_build_object('name', detail, 'amount', income) order by occurred_at), '[]'::jsonb)
    into v_other_income
  from public.transactions
  where category = 'field_rental' and not is_void and occurred_at between v_start and v_end;

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

  v_total_income := v_rent_income + v_product_sales;
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

-- ============================================================
-- get_report_archive — 12-month summary for one year, powers the Archive dialog.
-- ============================================================
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
    v_start := (make_date(p_year, v_month, 1) - interval '1 month') + interval '25 days';
    v_end := make_date(p_year, v_month, 25) + interval '1 day' - interval '1 second';

    select count(*) into v_row_count
    from public.transactions
    where not is_void and occurred_at between v_start and v_end
      and category not in ('transfer', 'profit_allocation');

    select * into v_alloc from public.profit_allocations where month = v_month and year = p_year;
    select * into v_report_row from public.reports
      where month = v_month and year = p_year order by created_at desc limit 1;

    v_meta := jsonb_build_object(
      'month', v_month,
      'month_name', v_month_names[v_month + 1],
      'row_count', v_row_count,
      'allocated', (v_alloc.id is not null),
      'alloc_date', case when v_alloc.id is not null then to_char(v_alloc.created_at, 'DD/MM/YYYY') else null end,
      'has_pdf', (v_report_row.id is not null),
      'storage_path', v_report_row.storage_path,
      'pdf_created_at', case when v_report_row.id is not null
        then to_char(v_report_row.created_at, 'DD/MM/YYYY HH24:MI') else null end
    );

    -- object || object merges keys; wrapping in parens first, THEN appending to the
    -- array, is what makes this one combined element instead of two separate ones.
    v_out := v_out || (v_meta || v_report);
  end loop;

  return v_out;
end;
$$;

-- ============================================================
-- save_allocation_entry — admin-only "close period". Recomputes net profit
-- server-side; the profit_allocations.period UNIQUE constraint (not a
-- row-by-row tag scan) is what rejects a repeat close.
-- ============================================================
create or replace function public.save_allocation_entry(p_month int, p_year int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_report jsonb;
  v_alloc jsonb;
  v_period text;
  v_net_profit numeric;
  v_total_out numeric;
  v_emergency numeric;
  v_txn_id uuid;
  v_alloc_id uuid;
  v_exists boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'ไม่ได้เข้าสู่ระบบ');
  end if;
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', '❌ เฉพาะแอดมินเท่านั้นที่ปิดงวดได้');
  end if;

  v_report := public.get_report_by_month(p_month, p_year);
  v_alloc := v_report -> 'alloc';
  v_period := v_report ->> 'period';
  v_net_profit := (v_alloc ->> 'net_profit')::numeric;

  if v_net_profit <= 0 then
    return jsonb_build_object(
      'ok', false,
      'message', format('กำไรสุทธิรอบนี้เท่ากับ %s บาท (ไม่เป็นบวก) จึงยังจัดสรรไม่ได้', v_net_profit)
    );
  end if;

  select exists (select 1 from public.profit_allocations where period = v_period) into v_exists;
  if v_exists then
    return jsonb_build_object(
      'ok', true, 'status', 'exists',
      'message', '⚠️ รอบนี้เคยจัดสรรกำไรไปแล้ว ระบบจึงไม่บันทึกซ้ำ (ยังออก PDF ได้ตามปกติ)',
      'alloc', v_alloc, 'period', v_period
    );
  end if;

  v_total_out := (v_alloc ->> 'total_out')::numeric;
  v_emergency := (v_alloc ->> 'emergency')::numeric;

  insert into public.transactions (detail, income, expense, payment_method, category, mode, created_by)
  values ('จัดสรรกำไรส่วนกลาง (' || v_period || ')', 0, v_total_out, 'transfer', 'profit_allocation', 'allocation', v_uid)
  returning id into v_txn_id;

  insert into public.profit_allocations (
    month, year, period, net_profit, scholarship, emergency, rotate, staff, total_out, transaction_id, created_by
  ) values (
    p_month, p_year, v_period, v_net_profit,
    (v_alloc ->> 'scholarship')::numeric, v_emergency, (v_alloc ->> 'rotate')::numeric, (v_alloc ->> 'staff')::numeric,
    v_total_out, v_txn_id, v_uid
  )
  returning id into v_alloc_id;

  insert into public.reserve_fund_entries (period, amount, allocation_id)
  values (v_period, v_emergency, v_alloc_id);

  insert into public.audit_log (actor_id, action, detail, amount, mode)
  values (v_uid, 'จัดสรรกำไร', 'จัดสรรกำไรส่วนกลาง (' || v_period || ')', v_total_out, 'allocation');

  return jsonb_build_object(
    'ok', true, 'status', 'ok',
    'message', format('✅ บันทึกการจัดสรรกำไรสำเร็จ (ดึงออกจากบัญชี %s บาท)', v_total_out),
    'alloc', v_alloc, 'period', v_period
  );
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;
