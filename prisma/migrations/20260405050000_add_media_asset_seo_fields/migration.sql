-- RA-418: SEO/AEO/GEO structured data fields on MediaAsset
-- altText: AI-generated SEO-optimised alt text
-- seoJsonLd: Cached schema.org/ImageObject JSON-LD output

ALTER TABLE "MediaAsset"
  ADD COLUMN IF NOT EXISTS "altText"   TEXT,
  ADD COLUMN IF NOT EXISTS "seoJsonLd" JSONB;
