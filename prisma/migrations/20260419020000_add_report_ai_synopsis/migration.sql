-- Migration: add_report_ai_synopsis
-- RA-1192: AI-generated one-line synopsis shown per row on /dashboard/reports.
-- Nullable so existing reports continue to render without backfill; `aiSynopsisAt`
-- drives the 24-hour freshness cache in POST /api/reports/[id]/synopsis.

ALTER TABLE "Report"
  ADD COLUMN IF NOT EXISTS "aiSynopsis" TEXT,
  ADD COLUMN IF NOT EXISTS "aiSynopsisAt" TIMESTAMP(3);
