-- The sell form now has a "หมวดหมู่" dropdown on every income line
-- (ค่าเช่าสนาม / ขายสินค้า / รายได้อื่นๆ). Until now the category was
-- inferred only: a matched product took its own category, and anything
-- else was forced into 'other_income' — so a hand-typed "ค่าเช่าสนาม"
-- landed in รายได้อื่นๆ instead of the report's rent line.
--
-- save_transaction: each cart line may carry `category`; if present it must
-- be one of the three income categories and wins over the inferred one.
-- Lines without it (older clients) keep the old inference.
--
-- void_transaction: stock was only given back for category 'product_sale',
-- but a matched product is now allowed to be filed under any income
-- category — so restore stock for any income line tied to a product.

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
  v_new_stock numeric;
  v_new_cost numeric;
  v_category text;
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
    if p_mode = 'income' and (v_item ->> 'category') is not null
       and (v_item ->> 'category') not in ('field_rental', 'product_sale', 'other_income') then
      return jsonb_build_object('ok', false, 'message', format('❌ ''%s'' หมวดหมู่ไม่ถูกต้อง', v_name));
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
            coalesce(
              v_item ->> 'category',
              case when v_product.category = 'field_rental' then 'field_rental' else 'product_sale' end
            ),
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
            coalesce(v_item ->> 'category', 'other_income'), 'income'
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
      v_detail := v_name || ' [รับเข้า ' || v_qty || ' @' || round(v_total / nullif(v_qty, 0), 2) || '/หน่วย]';
      insert into public.transactions (
        product_id, product_name, qty, unit_price, detail, income, expense, payment_method, category, mode
      ) values (
        v_product.id, v_name, v_qty, v_total / nullif(v_qty, 0), v_detail, 0, v_total,
        case when p_payment_type = 'เงินสด' then 'cash' else 'transfer' end,
        'stock_purchase', 'stock_in'
      );

      v_new_stock := v_product.stock + v_qty;
      if v_product.stock > 0 then
        -- blend with what's already on the shelf, weighted by quantity
        v_new_cost := round((v_product.stock * v_product.cost + v_total) / v_new_stock, 2);
      else
        -- nothing real to blend with (empty or already-wrong stock) — this
        -- batch's unit cost becomes the new cost outright
        v_new_cost := round(v_total / v_qty, 2);
      end if;

      update public.products
        set stock = v_new_stock, cost = v_new_cost, updated_at = now()
        where id = v_product.id;
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
create or replace function public.void_transaction(p_transaction_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn record;
  v_alloc record;
begin
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
      remaining_amount, remaining_cost, remaining_profit, status
    ) values (
      trim(replace(v_txn.detail, 'รับชำระหนี้:', '')),
      'คืนยอดจากการ Void',
      v_txn.income, v_txn.cost_total, v_txn.profit_total,
      v_txn.income, v_txn.cost_total, v_txn.profit_total,
      'outstanding'
    );

  elsif v_txn.mode = 'income' and v_txn.product_id is not null then
    update public.products set stock = stock + coalesce(v_txn.qty, 0), updated_at = now() where id = v_txn.product_id;

  elsif v_txn.category = 'stock_purchase' and v_txn.product_id is not null then
    update public.products set stock = stock - coalesce(v_txn.qty, 0), updated_at = now() where id = v_txn.product_id;
  end if;

  update public.transactions
    set is_void = true, void_reason = p_reason, voided_at = now()
    where id = p_transaction_id;

  insert into public.audit_log (action, detail, amount, mode)
  values ('ลบรายการ (Void)', v_txn.detail, v_txn.income + v_txn.expense, 'void-main');

  return jsonb_build_object('ok', true, 'message', '✅ ลบรายการสำเร็จ!');
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;
