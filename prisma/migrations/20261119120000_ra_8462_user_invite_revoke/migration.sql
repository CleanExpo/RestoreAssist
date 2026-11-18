-- RA-8462: record who cancelled a pending team invite, and when.
-- Additive and nullable: existing rows are untouched.
ALTER TABLE "UserInvite" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "UserInvite" ADD COLUMN "revokedById" TEXT;
