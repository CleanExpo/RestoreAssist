-- RA-413: Add workspaceId to top-level customer data models
-- Adds nullable workspace FK to: Client, Report, Inspection, Invoice, Integration, CostLibrary, FormTemplate
-- All columns are nullable (backward-compatible); existing rows retain NULL until migrated via backfill.

-- Client
ALTER TABLE "Client" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Client" ADD CONSTRAINT "Client_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Client_workspaceId_idx" ON "Client"("workspaceId");

-- Report
ALTER TABLE "Report" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Report" ADD CONSTRAINT "Report_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Report_workspaceId_idx" ON "Report"("workspaceId");

-- Inspection
ALTER TABLE "Inspection" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Inspection_workspaceId_idx" ON "Inspection"("workspaceId");

-- Invoice
ALTER TABLE "Invoice" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Invoice_workspaceId_idx" ON "Invoice"("workspaceId");

-- Integration
ALTER TABLE "Integration" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Integration_workspaceId_idx" ON "Integration"("workspaceId");

-- CostLibrary
ALTER TABLE "CostLibrary" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "CostLibrary" ADD CONSTRAINT "CostLibrary_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CostLibrary_workspaceId_idx" ON "CostLibrary"("workspaceId");

-- FormTemplate
ALTER TABLE "FormTemplate" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FormTemplate_workspaceId_idx" ON "FormTemplate"("workspaceId");
