-- StorageRestoreJob is service-only: enable RLS so no authenticated/anon access is
-- possible; the Supabase service role (used by the server/queue) bypasses RLS.
-- Mirrors the StorageMirrorJob disposition (RA-4956 service-only tables).
ALTER TABLE "StorageRestoreJob" ENABLE ROW LEVEL SECURITY;
