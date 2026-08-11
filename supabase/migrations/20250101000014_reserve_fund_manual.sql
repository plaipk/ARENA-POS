-- Powers a new /reserve-fund page: view the emergency reserve
-- ("เงินสำรองสนาม" / "สำรองฉุกเฉิน") ledger — both the automatic 30%
-- entries written by save_allocation_entry() on period close (allocation_id
-- set) and new manual entries (allocation_id null) for things like an
-- ad-hoc withdrawal that isn't tied to any period close, matching the old
-- sheet's "เงินสำรองสนาม" tab (เดือน/รับ/จ่าย/หมายเหตุ).

alter table public.reserve_fund_entries add column note text;

create or replace function public.add_reserve_fund_entry(p_period text, p_amount numeric, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_period), '') = '' then
    return jsonb_build_object('ok', false, 'message', '❌ กรุณาระบุรายการ/ช่วงเวลา');
  end if;
  if p_amount is null or p_amount = 0 then
    return jsonb_build_object('ok', false, 'message', '❌ จำนวนเงินต้องไม่เป็น 0');
  end if;

  insert into public.reserve_fund_entries (period, amount, note)
  values (trim(p_period), p_amount, nullif(trim(p_note), ''))
  returning id into v_id;

  insert into public.audit_log (action, detail, amount)
  values (
    'บันทึกเงินสำรองสนาม',
    trim(p_period) || case when nullif(trim(p_note), '') is not null then ' — ' || trim(p_note) else '' end,
    p_amount
  );

  return jsonb_build_object('ok', true, 'message', '✅ บันทึกรายการสำเร็จ!', 'id', v_id);
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

grant execute on function public.add_reserve_fund_entry(text, numeric, text) to anon, authenticated;
