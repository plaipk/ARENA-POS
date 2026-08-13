-- Two things:
--   1. Both closing paths already refuse a second write for the same
--      period (profit_allocations.period is UNIQUE, checked explicitly
--      before insert) — this just makes the client stop offering the
--      button once a period is already closed, instead of relying on the
--      user re-clicking into a friendly "already done" message.
--   2. Gives a way to undo a close made on wrong data. A normal close's
--      withdrawal could already be reversed indirectly (void the
--      "จัดสรรกำไรส่วนกลาง" transaction from the Statement page — void_transaction
--      already deletes the matching profit_allocations + reserve_fund_entries
--      rows when it sees category='profit_allocation'), but that only
--      worked for that one path, required knowing where to look, and a
--      ปิดงวดแบบไม่จัดสรร close has no transaction to void in the first
--      place. reopen_period() handles both from one place: reverses the
--      withdrawal transaction if there was one, deletes the reserve-fund
--      entry it created if any, then deletes the profit_allocations row —
--      after which the period is exactly as unclosed as before, so fixing
--      the underlying data and closing again works normally.

create or replace function public.reopen_period(p_month int, p_year int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alloc record;
begin
  select * into v_alloc from public.profit_allocations where month = p_month and year = p_year;
  if not found then
    return jsonb_build_object('ok', false, 'message', '❌ รอบนี้ยังไม่เคยปิดงวด');
  end if;

  if v_alloc.transaction_id is not null then
    update public.transactions
      set is_void = true, void_reason = 'ยกเลิกการปิดงวด (แก้ไขข้อมูลผิด)', voided_at = now()
      where id = v_alloc.transaction_id and not is_void;
    delete from public.reserve_fund_entries where allocation_id = v_alloc.id;
  end if;

  delete from public.profit_allocations where id = v_alloc.id;

  insert into public.audit_log (action, detail, amount, mode)
  values ('ยกเลิกการปิดงวด', v_alloc.period, v_alloc.total_out, 'reopen-period');

  return jsonb_build_object(
    'ok', true,
    'message', format('✅ ยกเลิกการปิดงวด %s สำเร็จ — แก้ไขข้อมูลแล้วปิดงวดใหม่ได้เลย', v_alloc.period)
  );
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

grant execute on function public.reopen_period(int, int) to anon, authenticated;
