-- One-off cleanup: reverses 20250101000007_documents.sql (the generic
-- "other documents" upload feature), which shipped briefly and was then
-- scoped back out — the Documents page ("เอกสาร") is monthly PDF reports
-- only. This file is NOT part of the numbered migrations sequence (that
-- migration was removed from the repo entirely); it exists only so anyone
-- who already ran 20250101000007_documents.sql against their project can
-- paste this once into the Supabase SQL Editor to bring the schema back in
-- line with what's in supabase/migrations/ now. Safe to run even if nothing
-- was ever uploaded (the table's presumed empty) — this does not touch any
-- other table.
--
-- IMPORTANT — do this part FIRST, in the Dashboard, not here:
-- Supabase blocks raw `delete from storage.objects` / `storage.buckets` from
-- SQL (`protect_delete()` trigger — Storage rows must go through the Storage
-- API, not plain SQL, so the underlying S3 objects get cleaned up too). Go to
-- Dashboard → Storage → select the "documents" bucket → Delete bucket (empty
-- buckets delete in one click; if it has files, empty it first, or the
-- Dashboard will offer to force-delete). THEN run the SQL below.

drop policy if exists "documents_bucket_delete" on storage.objects;
drop policy if exists "documents_bucket_write" on storage.objects;
drop policy if exists "documents_bucket_read" on storage.objects;

drop function if exists public.delete_document(uuid);
drop function if exists public.save_document_record(text, text, text, text, text);

drop table if exists public.documents;
