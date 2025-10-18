-- Rollback script for all migrations
-- WARNING: This will delete all data!

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_reports_updated_at ON reports;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop indexes (they will be dropped with the table, but listed for clarity)
DROP INDEX IF EXISTS idx_reports_created_at;
DROP INDEX IF EXISTS idx_reports_state;
DROP INDEX IF EXISTS idx_reports_damage_type;
DROP INDEX IF EXISTS idx_reports_total_cost;
DROP INDEX IF EXISTS idx_reports_client_name;
DROP INDEX IF EXISTS idx_reports_claim_number;
DROP INDEX IF EXISTS idx_reports_pagination;
DROP INDEX IF EXISTS idx_reports_created_at_range;
DROP INDEX IF EXISTS idx_reports_insurance_company;
DROP INDEX IF EXISTS idx_reports_state_damage_type;
DROP INDEX IF EXISTS idx_reports_cost_range;
DROP INDEX IF EXISTS idx_reports_fulltext_search;
DROP INDEX IF EXISTS idx_reports_cleanup;

-- Drop tables
DROP TABLE IF EXISTS reports;

-- Drop extensions (optional - may be used by other databases)
-- DROP EXTENSION IF EXISTS "uuid-ossp";
