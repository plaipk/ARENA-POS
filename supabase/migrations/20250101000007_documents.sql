-- Generic document library ("เอกสาร" page): arbitrary uploaded files (contracts,
-- receipts, misc paperwork) that sit alongside the monthly PDF report archive.
-- Same rules as everything else in this app: no direct table writes from the
-- client — upload goes straight to Storage from the browser (anon key), then
-- this table row is written through save_document_record() so the audit_log
-- entry and validation stay server-side; delete is also RPC-only.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '',
  description text,
  file_name text not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

create index documents_uploaded_at_idx on public.documents (uploaded_at desc);

alter table public.documents enable row level security;

create policy "documents_select" on public.documents
  for select to anon, authenticated using (true);

grant select on public.documents to anon, authenticated;

-- ============================================================
-- save_document_record — called after the client finishes uploading the
-- file straight to the `documents` Storage bucket (anon key can write there,
-- see the bucket policy below); this just records the metadata row.
-- ============================================================
create or replace function public.save_document_record(
  p_title text,
  p_category text,
  p_file_name text,
  p_storage_path text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := trim(p_title);
  v_id uuid;
begin
  if v_title = '' then
    return jsonb_build_object('ok', false, 'message', '❌ กรุณาระบุชื่อเอกสาร');
  end if;
  if coalesce(trim(p_storage_path), '') = '' or coalesce(trim(p_file_name), '') = '' then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่พบไฟล์ที่อัปโหลด');
  end if;

  insert into public.documents (title, category, description, file_name, storage_path)
  values (v_title, coalesce(trim(p_category), ''), nullif(trim(p_description), ''), p_file_name, p_storage_path)
  returning id into v_id;

  insert into public.audit_log (action, detail) values ('เพิ่มเอกสาร', v_title);

  return jsonb_build_object('ok', true, 'message', '✅ เพิ่มเอกสารสำเร็จ!', 'id', v_id);
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

-- ============================================================
-- delete_document — removes the row; returns storage_path so the client can
-- best-effort remove the underlying Storage object too (RLS lets anon write
-- to the bucket but this keeps the delete decision server-validated).
-- ============================================================
create or replace function public.delete_document(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_storage_path text;
begin
  select title, storage_path into v_title, v_storage_path from public.documents where id = p_id;
  if v_title is null then
    return jsonb_build_object('ok', false, 'message', '❌ ไม่พบเอกสารนี้');
  end if;

  delete from public.documents where id = p_id;
  insert into public.audit_log (action, detail) values ('ลบเอกสาร', v_title);

  return jsonb_build_object('ok', true, 'message', '✅ ลบเอกสารสำเร็จ!', 'storage_path', v_storage_path);
exception when others then
  return jsonb_build_object('ok', false, 'message', '❌ Error: ' || sqlerrm);
end;
$$;

grant execute on function
  public.save_document_record(text, text, text, text, text),
  public.delete_document(uuid)
to anon, authenticated;

-- ============================================================
-- Storage bucket for uploaded documents. Private bucket, 20MB cap, common
-- office/image/PDF mime types only. Unlike the `reports` bucket (server-only
-- uploads via the service-role key), anon needs INSERT/DELETE here too since
-- upload/delete happen directly from the browser — save_document_record()/
-- delete_document() are what keep the metadata row (and therefore the
-- audit_log trail) authoritative, not the Storage write itself.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do nothing;

create policy "documents_bucket_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'documents');

create policy "documents_bucket_write" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'documents');

create policy "documents_bucket_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'documents');
