-- Performance: composite indexes for high-traffic ordered queries.
-- These convert two-index merge operations into single efficient index scans.

-- AuditLog: inspection activity feed (WHERE inspectionId=? ORDER BY timestamp DESC LIMIT 20)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_inspectionId_timestamp_idx"
    ON "AuditLog"("inspectionId", "timestamp" DESC);

-- InspectionPhoto: photo gallery (WHERE inspectionId=? ORDER BY timestamp DESC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InspectionPhoto_inspectionId_timestamp_idx"
    ON "InspectionPhoto"("inspectionId", "timestamp" DESC);

-- Integration: health/metrics queries (WHERE userId=? AND status='CONNECTED')
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Integration_userId_status_idx"
    ON "Integration"("userId", "status");

-- UsageEvent: admin billing range scans (WHERE timestamp BETWEEN ? AND ?)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "UsageEvent_timestamp_idx"
    ON "UsageEvent"("timestamp");
