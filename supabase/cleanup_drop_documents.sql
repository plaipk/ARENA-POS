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

drop policy if exists "documents_bucket_delete" on storage.objects;
drop policy if exists "documents_bucket_write" on storage.objects;
drop policy if exists "documents_bucket_read" on storage.objects;
delete from storage.objects where bucket_id = 'documents';
delete from storage.buckets where id = 'documents';

drop function if exists public.delete_document(uuid);
drop function if exists public.save_document_record(text, text, text, text, text);

drop table if exists public.documents;
