-- Phase 10: Scope & Estimation System
-- Insurance-grade pricing with traceable calculations

-- ==============================================
-- 1) Pricing Profiles (tenant-specific rate libraries)
-- ==============================================
CREATE TABLE IF NOT EXISTS "pricing_profiles" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_default" BOOLEAN DEFAULT FALSE,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "pricing_profiles_org_id_idx" ON "pricing_profiles"("org_id");
CREATE INDEX IF NOT EXISTS "pricing_profiles_org_default_idx" ON "pricing_profiles"("org_id", "is_default");

-- ==============================================
-- 2) Labour Rates (per role, per profile)
-- ==============================================
CREATE TABLE IF NOT EXISTS "labour_rates" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL REFERENCES "pricing_profiles"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "rate_cents" INTEGER NOT NULL,
  "after_hours_multiplier" NUMERIC(4,2) DEFAULT 1.5,
  "description" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "labour_rates_org_profile_idx" ON "labour_rates"("org_id", "profile_id");
CREATE INDEX IF NOT EXISTS "labour_rates_role_idx" ON "labour_rates"("role");

-- ==============================================
-- 3) Equipment Rates (daily hire cost)
-- ==============================================
CREATE TABLE IF NOT EXISTS "equipment_rates" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL REFERENCES "pricing_profiles"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate_cents" INTEGER NOT NULL,
  "unit" TEXT DEFAULT 'day',
  "description" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "equipment_rates_org_profile_idx" ON "equipment_rates"("org_id", "profile_id");
CREATE INDEX IF NOT EXISTS "equipment_rates_code_idx" ON "equipment_rates"("code");

-- ==============================================
-- 4) Material Catalog (SKU-based)
-- ==============================================
CREATE TABLE IF NOT EXISTS "material_catalog" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit_cost_cents" INTEGER NOT NULL,
  "unit" TEXT DEFAULT 'EA',
  "supplier" TEXT,
  "description" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "material_catalog_org_idx" ON "material_catalog"("org_id");
CREATE INDEX IF NOT EXISTS "material_catalog_sku_idx" ON "material_catalog"("sku");

-- ==============================================
-- 5) Region Modifiers (state/metro multipliers)
-- ==============================================
CREATE TABLE IF NOT EXISTS "region_modifiers" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "labour_multiplier" NUMERIC(4,2) DEFAULT 1.0,
  "equipment_multiplier" NUMERIC(4,2) DEFAULT 1.0,
  "material_multiplier" NUMERIC(4,2) DEFAULT 1.0,
  "description" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "region_modifiers_org_idx" ON "region_modifiers"("org_id");

-- ==============================================
-- 6) Scope Assemblies (service-specific templates)
-- ==============================================
CREATE TABLE IF NOT EXISTS "scope_assemblies" (
  "id" TEXT PRIMARY KEY,
  "org_id" TEXT NOT NULL,
  "service_type" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "inputs" JSONB DEFAULT '{}',
  "labour" JSONB DEFAULT '[]',
  "equipment" JSONB DEFAULT '[]',
  "materials" JSONB DEFAULT '[]',
  "clauses" JSONB DEFAULT '[]',
  "tags" TEXT[],
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW(),
  UNIQUE("org_id", "code")
);

CREATE INDEX IF NOT EXISTS "scope_assemblies_org_service_idx" ON "scope_assemblies"("org_id", "service_type");
CREATE INDEX IF NOT EXISTS "scope_assemblies_code_idx" ON "scope_assemblies"("code");

-- ==============================================
-- 7) Report Scope Lines (generated per report)
-- ==============================================
CREATE TABLE IF NOT EXISTS "report_scope_lines" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "org_id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "assembly_id" TEXT REFERENCES "scope_assemblies"("id") ON DELETE SET NULL,
  "service_type" TEXT NOT NULL,
  "line_code" TEXT NOT NULL,
  "line_description" TEXT NOT NULL,
  "qty" NUMERIC(10,2) DEFAULT 1,
  "unit" TEXT DEFAULT 'EA',
  "labour_cost_cents" INTEGER DEFAULT 0,
  "equipment_cost_cents" INTEGER DEFAULT 0,
  "material_cost_cents" INTEGER DEFAULT 0,
  "clause_citation" TEXT,
  "calc_details" JSONB DEFAULT '{}',
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "report_scope_lines_org_report_idx" ON "report_scope_lines"("org_id", "report_id");
CREATE INDEX IF NOT EXISTS "report_scope_lines_service_idx" ON "report_scope_lines"("service_type");

-- ==============================================
-- 8) Report Estimates (OH&P, GST, totals)
-- ==============================================
CREATE TABLE IF NOT EXISTS "report_estimates" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "org_id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL UNIQUE,
  "subtotal_cents" INTEGER NOT NULL,
  "overhead_pct" NUMERIC(5,2) DEFAULT 15,
  "profit_pct" NUMERIC(5,2) DEFAULT 20,
  "contingency_pct" NUMERIC(5,2) DEFAULT 10,
  "gst_pct" NUMERIC(5,2) DEFAULT 10,
  "total_before_gst_cents" INTEGER NOT NULL,
  "gst_cents" INTEGER NOT NULL,
  "total_inc_gst_cents" INTEGER NOT NULL,
  "breakdown" JSONB DEFAULT '{}',
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "report_estimates_org_idx" ON "report_estimates"("org_id");
CREATE INDEX IF NOT EXISTS "report_estimates_report_idx" ON "report_estimates"("report_id");

-- ==============================================
-- 9) Insert Default Data (for default org)
-- ==============================================

-- Default pricing profile
INSERT INTO "pricing_profiles" ("id", "org_id", "name", "is_default", "created_at", "updated_at")
SELECT
  'default_profile',
  'default',
  'Default Pricing Profile',
  TRUE,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "pricing_profiles" WHERE "id" = 'default_profile');

-- Default labour rates
INSERT INTO "labour_rates" ("id", "org_id", "profile_id", "role", "rate_cents", "after_hours_multiplier", "description")
VALUES
  ('labour_lead_tech', 'default', 'default_profile', 'Lead Tech', 8500, 1.5, 'Certified lead technician'),
  ('labour_tech', 'default', 'default_profile', 'Tech', 6500, 1.5, 'Field technician'),
  ('labour_supervisor', 'default', 'default_profile', 'Supervisor', 9500, 1.5, 'Site supervisor'),
  ('labour_laborer', 'default', 'default_profile', 'Labourer', 5500, 1.5, 'General labour')
ON CONFLICT DO NOTHING;

-- Default equipment rates
INSERT INTO "equipment_rates" ("id", "org_id", "profile_id", "code", "name", "rate_cents", "unit", "description")
VALUES
  ('equip_lgr', 'default', 'default_profile', 'LGR_DEHUMIDIFIER', 'LGR Dehumidifier', 12000, 'day', 'Low grain refrigerant dehumidifier'),
  ('equip_airmover', 'default', 'default_profile', 'AIRMOVER_STD', 'Air Mover (Standard)', 3500, 'day', 'Axial air mover'),
  ('equip_hepa', 'default', 'default_profile', 'HEPA_SCRUBBER', 'HEPA Air Scrubber', 15000, 'day', 'Negative air machine with HEPA'),
  ('equip_hydroxyl', 'default', 'default_profile', 'HYDROXYL_GEN', 'Hydroxyl Generator', 18000, 'day', 'Odour removal hydroxyl generator'),
  ('equip_ozone', 'default', 'default_profile', 'OZONE_GEN', 'Ozone Generator', 12000, 'day', 'Ozone shock treatment unit')
ON CONFLICT DO NOTHING;

-- Default materials
INSERT INTO "material_catalog" ("id", "org_id", "sku", "name", "unit_cost_cents", "unit", "description")
VALUES
  ('mat_plastic', 'default', 'PLASTIC_200UM', 'Plastic Sheeting (200µm)', 250, 'm2', 'Heavy duty containment plastic'),
  ('mat_tape', 'default', 'TAPE_DUCT', 'Duct Tape', 850, 'roll', 'Heavy duty duct tape'),
  ('mat_antimicrobial', 'default', 'ANTIMICROBIAL_SPRAY', 'Antimicrobial Spray', 3500, 'litre', 'EPA approved antimicrobial'),
  ('mat_desiccant', 'default', 'DESICCANT_BAG', 'Desiccant Bag', 1200, 'EA', 'Moisture absorber bag'),
  ('mat_hepa_filter', 'default', 'HEPA_FILTER', 'HEPA Filter', 8500, 'EA', 'Replacement HEPA filter')
ON CONFLICT DO NOTHING;

-- Default region modifier (Australia - Sydney Metro)
INSERT INTO "region_modifiers" ("id", "org_id", "region", "labour_multiplier", "equipment_multiplier", "material_multiplier", "description")
VALUES
  ('region_syd', 'default', 'Sydney Metro', 1.15, 1.10, 1.05, 'Sydney metropolitan area pricing')
ON CONFLICT DO NOTHING;

-- ==============================================
-- Comments for documentation
-- ==============================================
COMMENT ON TABLE "pricing_profiles" IS 'Tenant-specific rate libraries for labour, equipment, materials';
COMMENT ON TABLE "labour_rates" IS 'Hourly rates per role with after-hours multipliers';
COMMENT ON TABLE "equipment_rates" IS 'Daily rental rates for equipment';
COMMENT ON TABLE "material_catalog" IS 'SKU-based material pricing';
COMMENT ON TABLE "region_modifiers" IS 'Geographic cost multipliers';
COMMENT ON TABLE "scope_assemblies" IS 'Service-specific work templates with clause citations';
COMMENT ON TABLE "report_scope_lines" IS 'Generated scope lines per report with traceable calculations';
COMMENT ON TABLE "report_estimates" IS 'Final estimates with OH&P, GST, and breakdown';

COMMENT ON COLUMN "scope_assemblies"."inputs" IS 'Required parameters (e.g., rooms, area_m2)';
COMMENT ON COLUMN "scope_assemblies"."labour" IS 'Labour requirements: [{"role":"Lead Tech","hours_per_room":0.5}]';
COMMENT ON COLUMN "scope_assemblies"."equipment" IS 'Equipment requirements: [{"code":"LGR","qty_per_room":1,"days":3}]';
COMMENT ON COLUMN "scope_assemblies"."materials" IS 'Material requirements: [{"sku":"PLASTIC_200UM","qty_per_m2":0.1}]';
COMMENT ON COLUMN "scope_assemblies"."clauses" IS 'Standards citations: [{"standard":"S500","section":"4.2"}]';

COMMENT ON COLUMN "report_scope_lines"."calc_details" IS 'Traceable calculation breakdown for insurance audit';
COMMENT ON COLUMN "report_estimates"."breakdown" IS 'Detailed OH&P components for transparency';
