-- Reverse of 20261003170000_ra_7893_user_organization_left_at.
--
-- Drops exactly the nullable column the forward migration adds.

ALTER TABLE "User" DROP COLUMN IF EXISTS "organizationLeftAt";
