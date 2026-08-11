-- Changes stock-take from "count and auto-correct" to "count and report only":
-- record_stock_take() no longer writes to products.stock at all — it just
-- records what was counted vs what the system says, for every item counted
-- (not just the ones that differ), grouped into one "session" so the
-- history page can show a full run (เกิน/ขาด/ตรง) instead of a handful of
-- scattered audit_log lines for mismatches only.

create table public.stock_take_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  product_id uuid references public.products (id),
  product_name text not null,
  system_stock numeric not null,
  counted_stock numeric not null,
  diff numeric not null,
  created_at timestamptz not null default now()
);

create index stock_take_items_session_idx on public.stock_take_items (session_id);
create index stock_take_items_created_at_idx on public.stock_take_items (created_at desc);

alter table public.stock_take_items enable row level security;

create policy "stock_take_items_select" on public.stock_take_items
  for select to anon, authenticated using (true);

grant select on public.stock_take_items to anon, authenticated;

create or replace function public.record_stock_take(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid := gen_random_uuid();
  v_item jsonb;
  v_id uuid;
  v_counted numeric;
  v_product record;
  v_diff numeric;
  v_over int := 0;
  v_short int := 0;
  v_match int := 0;
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

    select * into v_product from public.products where id = v_id;
    if not found then
      continue;
    end if;

    v_diff := v_counted - v_product.stock;
    if v_diff > 0 then v_over := v_over + 1;
    elsif v_diff < 0 then v_short := v_short + 1;
    else v_match := v_match + 1;
    end if;

    -- Deliberately does NOT touch products.stock — this is a count/report
    -- only, not a correction. Reviewing + fixing stock is a separate step
    -- (edit the product directly) if the numbers say it's needed.
    insert into public.stock_take_items
      (session_id, product_id, product_name, system_stock, counted_stock, diff)
    values
      (v_session_id, v_id, v_product.name, v_product.stock, v_counted, v_diff);
  end loop;

  if (v_over + v_short + v_match) = 0 then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่มีรายการที่กรอกจำนวนไว้');
  end if;

  insert into public.audit_log (action, detail)
  values (
    'นับสต็อก',
    format('นับสต็อก %s รายการ (เกิน %s, ขาด %s, ตรง %s)', v_over + v_short + v_match, v_over, v_short, v_match)
  );

  return jsonb_build_object(
    'ok', true,
    'message', format('✅ บันทึกผลนับสต็อกสำเร็จ! เกิน %s รายการ, ขาด %s รายการ, ตรง %s รายการ', v_over, v_short, v_match),
    'session_id', v_session_id,
    'over', v_over,
    'short', v_short,
    'match', v_match
  );
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

grant execute on function public.record_stock_take(jsonb) to anon, authenticated;
