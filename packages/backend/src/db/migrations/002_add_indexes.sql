-- Migration: Add additional performance indexes
-- Description: Optimize queries for statistics and filtering
-- Author: RestoreAssist
-- Date: 2025-10-18

-- Index for finding reports within date ranges
CREATE INDEX idx_reports_created_at_range ON reports(created_at)
    WHERE deleted_at IS NULL;

-- Index for insurance company queries
CREATE INDEX idx_reports_insurance_company ON reports(insurance_company)
    WHERE deleted_at IS NULL AND insurance_company IS NOT NULL;

-- Composite index for state + damage type filtering
CREATE INDEX idx_reports_state_damage_type ON reports(state, damage_type)
    WHERE deleted_at IS NULL;

-- Index for cost-based queries
CREATE INDEX idx_reports_cost_range ON reports(total_cost)
    WHERE deleted_at IS NULL AND total_cost > 0;

-- GIN index for full-text search on summary and description
CREATE INDEX idx_reports_fulltext_search ON reports
    USING GIN (to_tsvector('english', summary || ' ' || damage_description))
    WHERE deleted_at IS NULL;

-- Index for cleanup queries (finding old reports)
CREATE INDEX idx_reports_cleanup ON reports(created_at, deleted_at)
    WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_reports_fulltext_search IS 'Full-text search index for summary and description';
COMMENT ON INDEX idx_reports_cleanup IS 'Index for efficient cleanup of old reports';
