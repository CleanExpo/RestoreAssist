-- Reverse of 20261003170000_ra_7893_user_organization_left_at.
--
-- Drops exactly the nullable columns the forward migration adds.

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "organizationLeftAt",
  DROP COLUMN IF EXISTS "organizationLeftId";
