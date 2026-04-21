-- RA-1365: extend EstimateStatus enum.
-- Adds: SENT, REJECTED, EXPIRED, WITHDRAWN.
-- Does NOT backfill automatically — that's intentionally a product
-- decision (which CLIENT_REVIEW rows count as EXPIRED vs stuck?). A
-- follow-up admin task can run a manual backfill with operator review.
--
-- Postgres enums: ALTER TYPE ... ADD VALUE requires each statement
-- run in its own transaction. Prisma's migrate runner does this
-- per-statement — separate statements below, no explicit BEGIN.

ALTER TYPE "EstimateStatus" ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE "EstimateStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "EstimateStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "EstimateStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';
