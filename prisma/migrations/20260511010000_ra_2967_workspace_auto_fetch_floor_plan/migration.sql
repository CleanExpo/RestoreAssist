-- RA-2967: Workspace-level opt-in for auto-fetching the floor plan underlay
-- the first time a tech opens an inspection. Defaults OFF.

ALTER TABLE "Workspace"
  ADD COLUMN "autoFetchFloorPlanOnInspection" BOOLEAN NOT NULL DEFAULT false;
