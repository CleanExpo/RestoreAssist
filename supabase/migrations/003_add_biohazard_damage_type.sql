-- Migration: Add Biohazard to damage_type enum
-- Description: Adds 'Biohazard' as a new damage type option
-- Date: 2025-10-21

-- Drop the old CHECK constraint
ALTER TABLE reports
DROP CONSTRAINT IF EXISTS reports_damage_type_check;

-- Add new CHECK constraint with Biohazard included
ALTER TABLE reports
ADD CONSTRAINT reports_damage_type_check
CHECK (damage_type IN ('Water', 'Fire', 'Storm', 'Flood', 'Mould', 'Biohazard', 'Impact', 'Other'));

-- Update the comment
COMMENT ON COLUMN reports.damage_type IS 'Type of damage (Water, Fire, Storm, Flood, Mould, Biohazard, Impact, Other)';

-- Confirmation
SELECT 'Migration complete: Biohazard damage type added' as status;
