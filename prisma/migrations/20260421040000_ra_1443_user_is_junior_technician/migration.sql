-- RA-1443 / M-16: Junior Technician ring-fence flag on User.
-- Default false so existing users keep their current role resolution;
-- admin-only UI flips this true to restrict the user to evidence-capture
-- only (no Progress-framework transitions beyond the initial capture step).
ALTER TABLE "User" ADD COLUMN "isJuniorTechnician" BOOLEAN NOT NULL DEFAULT false;
