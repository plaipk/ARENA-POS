-- Stock take ("นับสต็อก"): staff physically counts shelf stock and the system
-- snaps every counted product's `stock` to match, logging each adjustment
-- (old -> new, and the delta) to audit_log. Same rule as the rest of the
-- app: no direct table writes from the client, one RPC does the whole batch
-- in a single transaction.

create or replace function public.record_stock_take(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_counted numeric;
  v_product record;
  v_diff numeric;
  v_adjusted int := 0;
  v_unchanged int := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่มีรายการให้นับ');
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_id := (v_item ->> 'product_id')::uuid;
    v_counted := (v_item ->> 'counted_stock')::numeric;

    if v_id is null or v_counted is null or v_counted < 0 then
      continue; -- skip malformed/blank rows instead of failing the whole batch
    end if;

    select * into v_product from public.products where id = v_id for update;
    if not found then
      continue;
    end if;

    v_diff := v_counted - v_product.stock;
    if v_diff = 0 then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;

    update public.products set stock = v_counted, updated_at = now() where id = v_id;

    insert into public.audit_log (action, detail, amount)
    values (
      'นับสต็อก',
      format('%s: เดิม %s → นับได้ %s (%s%s)', v_product.name, v_product.stock, v_counted,
        case when v_diff > 0 then '+' else '' end, v_diff),
      v_diff
    );
    v_adjusted := v_adjusted + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'message', format('✅ นับสต็อกสำเร็จ! ปรับ %s รายการ (ตรงอยู่แล้ว %s รายการ)', v_adjusted, v_unchanged),
    'adjusted', v_adjusted,
    'unchanged', v_unchanged
  );
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

grant execute on function public.record_stock_take(jsonb) to anon, authenticated;
