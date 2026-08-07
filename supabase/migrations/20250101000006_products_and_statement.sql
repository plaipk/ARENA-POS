-- Adds a Products management page and an editable Statement (ledger) page.
-- Same rule as everything else: no direct table writes from the client —
-- these RPC functions are the only way to create/edit/delete a product or
-- correct a transaction row.

-- ============================================================
-- upsert_product — create a new product, or edit an existing one (by id).
-- ============================================================
create or replace function public.upsert_product(
  p_id uuid,
  p_name text,
  p_category text,
  p_cost numeric,
  p_price numeric,
  p_stock numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(p_name);
  v_id uuid;
begin
  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', '❌ กรุณาระบุชื่อสินค้า');
  end if;
  if p_category not in ('merchandise', 'field_rental') then
    return jsonb_build_object('ok', false, 'message', '❌ ประเภทสินค้าไม่ถูกต้อง');
  end if;
  if p_cost is null or p_cost < 0 or p_price is null or p_price < 0 then
    return jsonb_build_object('ok', false, 'message', '❌ ต้นทุน/ราคาขายต้องไม่ติดลบ');
  end if;

  if p_id is null then
    if exists (select 1 from public.products where lower(name) = lower(v_name)) then
      return jsonb_build_object('ok', false, 'message', '❌ มีสินค้าชื่อนี้อยู่แล้ว');
    end if;
    insert into public.products (name, category, cost, price, stock)
    values (v_name, p_category, p_cost, p_price, coalesce(p_stock, 0))
    returning id into v_id;
    insert into public.audit_log (action, detail) values ('เพิ่มสินค้า', v_name);
    return jsonb_build_object('ok', true, 'message', '✅ เพิ่มสินค้าสำเร็จ!', 'id', v_id);
  end if;

  if exists (select 1 from public.products where lower(name) = lower(v_name) and id <> p_id) then
    return jsonb_build_object('ok', false, 'message', '❌ มีสินค้าชื่อนี้อยู่แล้ว');
  end if;

  update public.products
    set name = v_name, category = p_category, cost = p_cost, price = p_price,
        stock = coalesce(p_stock, stock), updated_at = now()
    where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่พบสินค้านี้');
  end if;

  insert into public.audit_log (action, detail) values ('แก้ไขสินค้า', v_name);
  return jsonb_build_object('ok', true, 'message', '✅ บันทึกการแก้ไขสำเร็จ!', 'id', p_id);
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

-- ============================================================
-- delete_product — blocked by the FK from transactions/debts if the
-- product has history; that's surfaced as a friendly message instead of a
-- raw constraint error.
-- ============================================================
create or replace function public.delete_product(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.products where id = p_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่พบสินค้านี้');
  end if;

  delete from public.products where id = p_id;
  insert into public.audit_log (action, detail) values ('ลบสินค้า', v_name);
  return jsonb_build_object('ok', true, 'message', '✅ ลบสินค้าสำเร็จ!');
exception
  when foreign_key_violation then
    return jsonb_build_object(
      'ok', false,
      'message', '❌ ลบไม่ได้ เพราะสินค้านี้มีประวัติการขาย/รับเข้าอยู่ในระบบแล้ว (แก้ไขข้อมูลแทนได้)'
    );
  when others then
    return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

-- ============================================================
-- update_transaction — quick corrections on a ledger row (date, detail,
-- amounts, payment method, category). Deliberately does NOT touch qty,
-- product_id, or stock — fixing what was actually sold/received should go
-- through Void + re-entering the sale, so stock stays correct. This is for
-- fixing typos: a wrong amount, wrong date, wrong payment method, etc.
-- ============================================================
create or replace function public.update_transaction(
  p_id uuid,
  p_occurred_at timestamptz,
  p_detail text,
  p_income numeric,
  p_expense numeric,
  p_payment_method text,
  p_category text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn record;
begin
  select * into v_txn from public.transactions where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่พบรายการนี้');
  end if;
  if v_txn.is_void then
    return jsonb_build_object('ok', false, 'message', '❌ รายการนี้ถูกยกเลิกไปแล้ว แก้ไขไม่ได้');
  end if;
  if coalesce(trim(p_detail), '') = '' then
    return jsonb_build_object('ok', false, 'message', '❌ กรุณาระบุรายละเอียดรายการ');
  end if;
  if p_income is null or p_income < 0 or p_expense is null or p_expense < 0 then
    return jsonb_build_object('ok', false, 'message', '❌ ยอดเงินต้องไม่ติดลบ');
  end if;
  if p_payment_method not in ('cash', 'transfer') then
    return jsonb_build_object('ok', false, 'message', '❌ ประเภทการชำระไม่ถูกต้อง');
  end if;
  if p_category not in (
    'product_sale', 'field_rental', 'general_expense', 'stock_purchase',
    'debt_settlement', 'transfer', 'profit_allocation'
  ) then
    return jsonb_build_object('ok', false, 'message', '❌ หมวดหมู่ไม่ถูกต้อง');
  end if;

  update public.transactions
    set occurred_at = coalesce(p_occurred_at, occurred_at),
        detail = trim(p_detail),
        income = p_income,
        expense = p_expense,
        payment_method = p_payment_method,
        category = p_category
    where id = p_id;

  insert into public.audit_log (action, detail, amount, mode)
  values ('แก้ไขรายการ', trim(p_detail), p_income + p_expense, 'edit');

  return jsonb_build_object('ok', true, 'message', '✅ บันทึกการแก้ไขสำเร็จ!');
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

grant execute on function
  public.upsert_product(uuid, text, text, numeric, numeric, numeric),
  public.delete_product(uuid),
  public.update_transaction(uuid, timestamptz, text, numeric, numeric, text, text)
to anon, authenticated;
