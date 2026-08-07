-- Storage bucket for generated monthly PDFs (replaces the "ARENA_Reports"
-- Google Drive folder). Private bucket: uploads only ever happen from the
-- /api/reports/generate route using the service-role key (bypasses RLS);
-- authenticated users get short-lived signed URLs to view/download.

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy "reports_bucket_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'reports');
