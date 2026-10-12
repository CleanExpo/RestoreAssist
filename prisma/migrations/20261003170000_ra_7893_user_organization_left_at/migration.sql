-- RA-7893: record when a member was removed from their organisation.
--
-- WHY
--   DELETE /api/team/members/[id] clears User.organizationId and leaves no
--   record of when. Without that date, a job a technician created while in
--   org A cannot be told apart from a job they created after leaving, so an
--   old org A job read the ex-member's own add-ons.
--
-- WHAT IT ADDS
--   Two nullable columns. organizationLeftAt (TIMESTAMP(3)) is when the
--   member left; organizationLeftId (TEXT, deliberately no foreign key so it
--   survives the organisation being deleted) is which organisation they
--   left. Member removal and owner account deletion stamp both. Existing
--   rows get NULL; nothing is backfilled. A removed member with no date
--   fails closed for jobs made after they joined (lib/organization-credits
--   getResourceTenantOwner).
--
-- ADDITIVE
--   ALTER TABLE ... ADD COLUMN with a nullable type. No data changes.
--
-- REVERSIBLE
--   down.sql drops exactly these columns.

ALTER TABLE "User"
  ADD COLUMN "organizationLeftAt" TIMESTAMP(3),
  ADD COLUMN "organizationLeftId" TEXT;
