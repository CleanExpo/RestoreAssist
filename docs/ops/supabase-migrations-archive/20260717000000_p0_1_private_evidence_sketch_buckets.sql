-- P0-1 (spec Appendix C, backlog P0-1 / RA-ARCH-01 H1): make evidence-optimised
-- and sketch-media PRIVATE and serve via short-lived signed URLs.
--
-- Before this migration `evidence-optimised` was a PUBLIC CDN bucket with a
-- `TO public` read policy (20260404_evidence_buckets.sql), so any reconstructed
-- object URL exposed a customer's compressed damage evidence and thumbnails with
-- no auth and no organisation check. `sketch-media` was likewise public. This
-- flips both to private (matching `evidence-originals`, which already works via
-- 1-hour signed URLs) and replaces the public-read policy with an
-- authenticated-only SELECT policy. The application serves reads through
-- short-lived signed URLs generated from the stored storage path.
--
-- Idempotent: safe to re-run.

-- ─── evidence-optimised → PRIVATE ────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'evidence-optimised';

DROP POLICY IF EXISTS "evidence-optimised: public read" ON storage.objects;

CREATE POLICY "evidence-optimised: authenticated can select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'evidence-optimised');

-- ─── sketch-media → PRIVATE ──────────────────────────────────────────────────
-- The bucket is created out-of-band (documented in lib/sketch-storage.ts). Flip
-- it private if present and ensure only an authenticated SELECT policy exists.
UPDATE storage.buckets SET public = false WHERE id = 'sketch-media';

DROP POLICY IF EXISTS "sketch-media: public read" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;

CREATE POLICY "sketch-media: authenticated can select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'sketch-media');
