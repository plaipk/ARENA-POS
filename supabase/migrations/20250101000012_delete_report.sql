-- Lets a generated PDF be deleted from the Documents page (e.g. cleaning up
-- an accidental duplicate from a double "สร้าง PDF" click). Same pattern as
-- delete_product: RPC removes the `reports` row and returns storage_path so
-- the client can also remove the underlying Storage object (client has
-- write access to the `reports` bucket only via the service-role key used
-- server-side at generation time — deleting the object itself still goes
-- through the client's anon key, which the "reports_bucket_read" policy
-- doesn't cover for DELETE, so this needs a small addition below too).

create policy "reports_bucket_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'reports');

create or replace function public.delete_report(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file_name text;
  v_storage_path text;
begin
  select file_name, storage_path into v_file_name, v_storage_path from public.reports where id = p_id;
  if v_file_name is null then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่พบไฟล์นี้');
  end if;

  delete from public.reports where id = p_id;
  insert into public.audit_log (action, detail) values ('ลบไฟล์รายงาน', v_file_name);

  return jsonb_build_object('ok', true, 'message', '✅ ลบไฟล์สำเร็จ!', 'storage_path', v_storage_path);
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

grant execute on function public.delete_report(uuid) to anon, authenticated;

-- ============================================================
-- get_report_archive — each pdf_versions entry now also carries its
-- `reports` row id, needed to call delete_report() from the client.
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
  v_pdf_versions jsonb;
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

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'storage_path', storage_path,
        'file_name', file_name,
        'created_at', to_char(created_at, 'DD/MM/YYYY HH24:MI')
      ) order by created_at desc), '[]'::jsonb)
      into v_pdf_versions
    from public.reports
    where month = v_month and year = p_year;

    v_meta := jsonb_build_object(
      'month', v_month,
      'month_name', v_month_names[v_month + 1],
      'row_count', v_row_count,
      'allocated', (v_alloc.id is not null),
      'alloc_date', case when v_alloc.id is not null then to_char(v_alloc.created_at, 'DD/MM/YYYY') else null end,
      'has_pdf', (v_report_row.id is not null),
      'storage_path', v_report_row.storage_path,
      'pdf_created_at', case when v_report_row.id is not null
        then to_char(v_report_row.created_at, 'DD/MM/YYYY HH24:MI') else null end,
      'pdf_versions', v_pdf_versions
    );

    v_out := v_out || (v_meta || v_report);
  end loop;

  return v_out;
end;
$$;
