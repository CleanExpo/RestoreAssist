-- RA-120 (PR2): floor plan + annotations in the canonical IICRC report.
--
-- Stores a rasterised PNG of each floor (underlay + annotations) captured
-- client-side via Fabric `canvas.toDataURL` and uploaded to the
-- `sketch-media/exports` bucket. The report PDF embeds this per floor because
-- the server cannot render the Fabric canvas itself.
--
-- Additive only — nullable column, no existing data altered. Safe to apply via
-- the normal migrate-deploy path.

-- AlterTable
ALTER TABLE "ClaimSketch" ADD COLUMN "renderedPngUrl" TEXT;
