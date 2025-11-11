-- Phase 10: Scope Assemblies Seed Data
-- Baseline templates for Water, Mould, Fire, and Bio services

-- ==============================================
-- WATER DAMAGE ASSEMBLIES
-- ==============================================

-- Water: Standard Room Drying
INSERT INTO "scope_assemblies" (
  "id", "org_id", "service_type", "code", "name", "description",
  "inputs", "labour", "equipment", "materials", "clauses", "tags"
)
VALUES (
  'water_dry_std_room',
  'default',
  'Water',
  'WATER_DRY_STD_ROOM',
  'Drying – Standard Room',
  'LGR dehumidifier + air movers for average bedroom/office (Class 2)',
  '{"rooms": 1, "avg_area_m2": 12}',
  '[{"role": "Lead Tech", "hours_per_room": 0.5}, {"role": "Tech", "hours_per_room": 0.3}]',
  '[{"code": "LGR_DEHUMIDIFIER", "qty_per_room": 1, "days": 3}, {"code": "AIRMOVER_STD", "qty_per_room": 3, "days": 3}]',
  '[{"sku": "PLASTIC_200UM", "qty_per_m2": 0.1}]',
  '[{"standard": "S500", "section": "4.2", "description": "Class 2 Water Damage"}]',
  ARRAY['water', 'drying', 'standard', 'class2']
)
ON CONFLICT (org_id, code) DO NOTHING;

-- Water: Wet Carpet Extraction
INSERT INTO "scope_assemblies" (
  "id", "org_id", "service_type", "code", "name", "description",
  "inputs", "labour", "equipment", "materials", "clauses", "tags"
)
VALUES (
  'water_carpet_extract',
  'default',
  'Water',
  'WATER_CARPET_EXTRACT',
  'Wet Carpet Extraction',
  'Hot water extraction and moisture mapping',
  '{"area_m2": 20}',
  '[{"role": "Lead Tech", "hours": 1.5}, {"role": "Tech", "hours": 1.0}]',
  '[{"code": "AIRMOVER_STD", "qty": 4, "days": 2}]',
  '[]',
  '[{"standard": "S500", "section": "5.1", "description": "Carpet Restoration"}]',
  ARRAY['water', 'carpet', 'extraction']
)
ON CONFLICT (org_id, code) DO NOTHING;

-- Water: Containment Setup
INSERT INTO "scope_assemblies" (
  "id", "org_id", "service_type", "code", "name", "description",
  "inputs", "labour", "equipment", "materials", "clauses", "tags"
)
VALUES (
  'water_containment',
  'default',
  'Water',
  'WATER_CONTAINMENT',
  'Containment – Plastic Barrier',
  'Poly containment with negative air for affected area',
  '{"linear_meters": 10}',
  '[{"role": "Tech", "hours": 2.0}]',
  '[{"code": "HEPA_SCRUBBER", "qty": 1, "days": 5}]',
  '[{"sku": "PLASTIC_200UM", "qty": 30}, {"sku": "TAPE_DUCT", "qty": 3}]',
  '[{"standard": "S500", "section": "6.3", "description": "Containment Protocols"}]',
  ARRAY['water', 'containment', 'barrier']
)
ON CONFLICT (org_id, code) DO NOTHING;

-- ==============================================
-- MOULD REMEDIATION ASSEMBLIES
-- ==============================================

-- Mould: Limited Remediation (<10sqft)
INSERT INTO "scope_assemblies" (
  "id", "org_id", "service_type", "code", "name", "description",
  "inputs", "labour", "equipment", "materials", "clauses", "tags"
)
VALUES (
  'mould_limited_rem',
  'default',
  'Mould',
  'MOULD_LIMITED_REM',
  'Mould Remediation – Limited Area',
  'Remediation of mould contamination < 3m² (Level 1)',
  '{"area_m2": 2}',
  '[{"role": "Lead Tech", "hours": 3.0}, {"role": "Tech", "hours": 2.0}]',
  '[{"code": "HEPA_SCRUBBER", "qty": 1, "days": 2}]',
  '[{"sku": "ANTIMICROBIAL_SPRAY", "qty": 1}, {"sku": "HEPA_FILTER", "qty": 1}]',
  '[{"standard": "S520", "section": "7.2.1", "description": "Level 1 Remediation"}]',
  ARRAY['mould', 'remediation', 'level1', 'limited']
)
ON CONFLICT (org_id, code) DO NOTHING;

-- Mould: Full Containment (>100sqft)
INSERT INTO "scope_assemblies" (
  "id", "org_id", "service_type", "code", "name", "description",
  "inputs", "labour", "equipment", "materials", "clauses", "tags"
)
VALUES (
  'mould_full_containment',
  'default',
  'Mould',
  'MOULD_FULL_CONTAINMENT',
  'Mould Remediation – Full Containment',
  'Large-scale remediation with double containment (Level 3)',
  '{"area_m2": 50}',
  '[{"role": "Supervisor", "hours": 8.0}, {"role": "Lead Tech", "hours": 16.0}, {"role": "Tech", "hours": 24.0}]',
  '[{"code": "HEPA_SCRUBBER", "qty": 3, "days": 7}, {"code": "AIRMOVER_STD", "qty": 6, "days": 7}]',
  '[{"sku": "PLASTIC_200UM", "qty": 100}, {"sku": "TAPE_DUCT", "qty": 10}, {"sku": "ANTIMICROBIAL_SPRAY", "qty": 5}, {"sku": "HEPA_FILTER", "qty": 3}]',
  '[{"standard": "S520", "section": "7.2.3", "description": "Level 3 Full Containment"}]',
  ARRAY['mould', 'remediation', 'level3', 'containment']
)
ON CONFLICT (org_id, code) DO NOTHING;

-- ==============================================
-- FIRE & SMOKE DAMAGE ASSEMBLIES
-- ==============================================

-- Fire: Soot Removal - Walls
INSERT INTO "scope_assemblies" (
  "id", "org_id", "service_type", "code", "name", "description",
  "inputs", "labour", "equipment", "materials", "clauses", "tags"
)
VALUES (
  'fire_soot_walls',
  'default',
  'Fire',
  'FIRE_SOOT_WALLS',
  'Soot & Smoke Cleaning – Walls',
  'HEPA vacuum + chemical sponge cleaning of walls',
  '{"area_m2": 30}',
  '[{"role": "Lead Tech", "hours": 4.0}, {"role": "Tech", "hours": 3.0}]',
  '[{"code": "HEPA_SCRUBBER", "qty": 1, "days": 3}]',
  '[]',
  '[{"standard": "IICRC Fire", "section": "9.1", "description": "Structural Cleaning"}]',
  ARRAY['fire', 'smoke', 'soot', 'cleaning']
)
ON CONFLICT (org_id, code) DO NOTHING;

-- Fire: Odour Mitigation - Hydroxyl
INSERT INTO "scope_assemblies" (
  "id", "org_id", "service_type", "code", "name", "description",
  "inputs", "labour", "equipment", "materials", "clauses", "tags"
)
VALUES (
  'fire_odour_hydroxyl',
  'default',
  'Fire',
  'FIRE_ODOUR_HYDROXYL',
  'Odour Mitigation – Hydroxyl Treatment',
  'Hydroxyl generator for smoke odour removal',
  '{"rooms": 3}',
  '[{"role": "Lead Tech", "hours": 1.0}]',
  '[{"code": "HYDROXYL_GEN", "qty_per_room": 1, "days": 5}]',
  '[]',
  '[{"standard": "IICRC Fire", "section": "10.2", "description": "Deodorization"}]',
  ARRAY['fire', 'odour', 'hydroxyl', 'deodorization']
)
ON CONFLICT (org_id, code) DO NOTHING;

-- Fire: Thermal Fogging
INSERT INTO "scope_assemblies" (
  "id", "org_id", "service_type", "code", "name", "description",
  "inputs", "labour", "equipment", "materials", "clauses", "tags"
)
VALUES (
  'fire_thermal_fog',
  'default',
  'Fire',
  'FIRE_THERMAL_FOG',
  'Thermal Fogging Treatment',
  'ULV thermal fogging for smoke odour penetration',
  '{"area_m2": 100}',
  '[{"role": "Lead Tech", "hours": 3.0}]',
  '[]',
  '[]',
  '[{"standard": "IICRC Fire", "section": "10.3", "description": "Advanced Deodorization"}]',
  ARRAY['fire', 'odour', 'fogging']
)
ON CONFLICT (org_id, code) DO NOTHING;

-- ==============================================
-- BIO-HAZARD ASSEMBLIES
-- ==============================================

-- Bio: Category 3 Water Cleanup
INSERT INTO "scope_assemblies" (
  "id", "org_id", "service_type", "code", "name", "description",
  "inputs", "labour", "equipment", "materials", "clauses", "tags"
)
VALUES (
  'bio_cat3_cleanup',
  'default',
  'Bio',
  'BIO_CAT3_CLEANUP',
  'Category 3 Water Cleanup',
  'Sewage/black water extraction with disinfection',
  '{"area_m2": 20}',
  '[{"role": "Supervisor", "hours": 2.0}, {"role": "Lead Tech", "hours": 6.0}, {"role": "Tech", "hours": 4.0}]',
  '[{"code": "HEPA_SCRUBBER", "qty": 2, "days": 3}, {"code": "AIRMOVER_STD", "qty": 4, "days": 3}]',
  '[{"sku": "ANTIMICROBIAL_SPRAY", "qty": 3}, {"sku": "PLASTIC_200UM", "qty": 40}]',
  '[{"standard": "S500", "section": "3.4", "description": "Category 3 Water"}]',
  ARRAY['bio', 'sewage', 'category3', 'disinfection']
)
ON CONFLICT (org_id, code) DO NOTHING;

-- Bio: Trauma Scene Cleanup
INSERT INTO "scope_assemblies" (
  "id", "org_id", "service_type", "code", "name", "description",
  "inputs", "labour", "equipment", "materials", "clauses", "tags"
)
VALUES (
  'bio_trauma_cleanup',
  'default',
  'Bio',
  'BIO_TRAUMA_CLEANUP',
  'Trauma/Crime Scene Cleanup',
  'Biohazard remediation with ATP testing verification',
  '{"area_m2": 10}',
  '[{"role": "Supervisor", "hours": 4.0}, {"role": "Lead Tech", "hours": 8.0}]',
  '[{"code": "HEPA_SCRUBBER", "qty": 2, "days": 2}, {"code": "OZONE_GEN", "qty": 1, "days": 1}]',
  '[{"sku": "ANTIMICROBIAL_SPRAY", "qty": 5}, {"sku": "PLASTIC_200UM", "qty": 30}]',
  '[{"standard": "OSHA Bloodborne", "section": "1910.1030", "description": "Bloodborne Pathogen Standard"}]',
  ARRAY['bio', 'trauma', 'bloodborne', 'hazmat']
)
ON CONFLICT (org_id, code) DO NOTHING;

-- ==============================================
-- Verification
-- ==============================================

-- Count inserted assemblies
SELECT
  service_type,
  COUNT(*) as assembly_count
FROM scope_assemblies
WHERE org_id = 'default'
GROUP BY service_type
ORDER BY service_type;
