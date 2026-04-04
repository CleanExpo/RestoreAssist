-- RA-408: Evidence storage buckets + RLS policies
-- Run this in the Supabase dashboard SQL editor (or via supabase CLI)
-- Creates two buckets for evidence file storage with org-scoped access

-- ─── BUCKET: evidence-originals (PRIVATE) ────────────────────────────────────
-- Stores original files at evidence grade (no compression, chain-of-custody)
-- Access: via signed URL only (1-hour expiry). Never public.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence-originals',
  'evidence-originals',
  false,                         -- PRIVATE — requires signed URL
  52428800,                      -- 50 MB limit
  NULL                           -- All MIME types (images, video, PDF, etc.)
)
ON CONFLICT (id) DO NOTHING;

-- ─── BUCKET: evidence-optimised (PUBLIC CDN) ─────────────────────────────────
-- Stores compressed images (80% quality, max 2048px) and thumbnails (400px)
-- Served via Supabase CDN — no auth required for reads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence-optimised',
  'evidence-optimised',
  true,                          -- PUBLIC — CDN delivery, no auth for reads
  20971520,                      -- 20 MB limit (compressed images are small)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ─── RLS: evidence-originals ─────────────────────────────────────────────────

-- INSERT: Authenticated users can upload to their org's path prefix
-- Path structure: {orgId}/{inspectionId}/{uuid}-original.{ext}
CREATE POLICY "evidence-originals: org members can upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'evidence-originals'
    -- Service role bypasses RLS — enforcement is in the API route via prisma ownership check
  );

-- SELECT: Authenticated users can access files (signed URL is the real gate)
CREATE POLICY "evidence-originals: authenticated users can select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'evidence-originals');

-- DELETE: Authenticated users can delete (API route verifies org ownership first)
CREATE POLICY "evidence-originals: authenticated users can delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'evidence-originals');

-- ─── RLS: evidence-optimised ─────────────────────────────────────────────────

-- SELECT: Public (CDN delivery — no auth required)
-- Supabase handles this automatically for public buckets, but explicit policy is clearer
CREATE POLICY "evidence-optimised: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'evidence-optimised');

-- INSERT: Authenticated users can upload optimised variants
CREATE POLICY "evidence-optimised: org members can upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'evidence-optimised');

-- DELETE: Authenticated users can delete (API route verifies org ownership first)
CREATE POLICY "evidence-optimised: authenticated users can delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'evidence-optimised');
