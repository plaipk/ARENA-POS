-- When a period's net profit isn't positive, save_allocation_entry refuses
-- outright (nothing to allocate) — which is correct, but left no way to
-- mark that period as "reviewed, genuinely nothing to split" instead of
-- just perpetually sitting as "ยังไม่จัดสรร" in the archive forever,
-- indistinguishable from a month nobody has looked at yet.
--
-- This adds a second closing path for that specific case: same
-- period-already-closed guard (profit_allocations.period is UNIQUE), but
-- inserts a zero-amount allocation row (no scholarship/emergency/staff
-- withdrawal, no transaction — there's nothing to move) so the period
-- reads as closed/reviewed. Refuses if net profit actually is positive —
-- that case should go through the real save_allocation_entry instead.

create or replace function public.close_period_without_allocation(p_month int, p_year int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report jsonb;
  v_period text;
  v_net_profit numeric;
  v_exists boolean;
begin
  v_report := public.get_report_by_month(p_month, p_year);
  v_period := v_report ->> 'period';
  v_net_profit := ((v_report -> 'alloc') ->> 'net_profit')::numeric;

  if v_net_profit > 0 then
    return jsonb_build_object(
      'ok', false,
      'message', format(
        'กำไรสุทธิรอบนี้เท่ากับ %s บาท (เป็นบวก) กรุณาใช้ปุ่ม "ปิดงวด + จัดสรรกำไร" แทน', v_net_profit
      )
    );
  end if;

  select exists (select 1 from public.profit_allocations where period = v_period) into v_exists;
  if v_exists then
    return jsonb_build_object(
      'ok', true, 'status', 'exists',
      'message', '⚠️ รอบนี้เคยปิดงวดไปแล้ว ระบบจึงไม่บันทึกซ้ำ',
      'period', v_period
    );
  end if;

  insert into public.profit_allocations (
    month, year, period, net_profit, scholarship, emergency, rotate, staff, total_out, transaction_id
  ) values (
    p_month, p_year, v_period, v_net_profit, 0, 0, 0, 0, 0, null
  );

  insert into public.audit_log (action, detail, amount, mode)
  values ('ปิดงวด (ไม่มีกำไรให้จัดสรร)', v_period, v_net_profit, 'close-no-alloc');

  return jsonb_build_object(
    'ok', true, 'status', 'ok',
    'message', format('✅ ปิดงวด %s สำเร็จ (กำไรสุทธิ %s บาท ไม่มีเงินให้จัดสรร)', v_period, v_net_profit),
    'period', v_period
  );
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

grant execute on function public.close_period_without_allocation(int, int) to anon, authenticated;
