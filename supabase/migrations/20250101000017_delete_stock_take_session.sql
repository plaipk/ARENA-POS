-- Lets a whole stock-take session (a single "round" of counting) be deleted
-- from the history — e.g. cleaning up a test run or a session someone
-- started counting into by mistake. Deletes every stock_take_items row
-- sharing that session_id; nothing else references this table (it's report
-- data only, record_stock_take() never touches products.stock), so there's
-- no cascading state to worry about.

create or replace function public.delete_stock_take_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.stock_take_items where session_id = p_session_id;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่พบรอบนับสต็อกนี้');
  end if;

  delete from public.stock_take_items where session_id = p_session_id;

  insert into public.audit_log (action, detail)
  values ('ลบรอบนับสต็อก', format('ลบรอบนับสต็อก %s รายการ', v_count));

  return jsonb_build_object('ok', true, 'message', '✅ ลบรอบนับสต็อกสำเร็จ!');
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

grant execute on function public.delete_stock_take_session(uuid) to anon, authenticated;
