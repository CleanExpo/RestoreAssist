-- Migration: n1_performance_indexes
-- Adds composite indexes to Inspection and MoistureReading tables
-- to support list queries ordered/filtered by userId+createdAt, userId+status,
-- and moisture reading queries ordered by inspectionId+recordedAt.
-- All indexes use CONCURRENTLY to avoid table locks on production.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Inspection_userId_createdAt_idx"
  ON "Inspection" ("userId", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Inspection_userId_status_idx"
  ON "Inspection" ("userId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "MoistureReading_inspectionId_recordedAt_idx"
  ON "MoistureReading" ("inspectionId", "recordedAt" DESC);
