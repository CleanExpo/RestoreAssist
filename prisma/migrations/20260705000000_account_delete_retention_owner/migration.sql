-- account-deletion-retention — seed the statutory-records retention owner.
--
-- Problem: User↔Invoice/Report/Estimate relations are onDelete: Cascade, so
-- POST /api/account/delete's `prisma.user.delete` CASCADE-destroys the tax
-- invoices, restoration/defect reports and estimates that the Privacy Policy
-- (/privacy#retention) PROMISES to retain for statutory periods — 7 years for
-- tax invoices (Taxation Administration Act s.262A), up to 10 years for
-- building-defect records, indefinite for dust-disease records. That is a
-- direct self-contradiction and an AU compliance exposure.
--
-- Fix (no schema/nullability change — keeps every existing `userId: string`
-- consumer type-safe): the delete route REASSIGNS the account holder's
-- statutory records onto this dedicated, PII-free system "retention owner"
-- inside a transaction BEFORE deleting the user, so the cascade has nothing
-- left to destroy. The account holder's own PII is still fully erased (their
-- User row is deleted). The reassigned owner id is the literal below; it is
-- mirrored by RETENTION_OWNER_USER_ID in app/api/account/delete/route.ts —
-- keep the two in sync.
--
-- Safety: additive + idempotent. It INSERTs one row and no-ops on re-run via
-- ON CONFLICT DO NOTHING (covers both the primary-key and the unique-email
-- constraint). It adds no columns, so it cannot trip the prod schema
-- drift-check. `updatedAt` is supplied explicitly because Prisma's @updatedAt
-- is a client-side concern with no DB default. All other NOT NULL columns
-- carry DB defaults (role, createdAt, experienceMode, boolean flags, …).

INSERT INTO "User" ("id", "email", "name", "role", "createdAt", "updatedAt")
VALUES (
  'system-retention-owner',
  'retention-owner@system.restoreassist.internal',
  'Statutory Records (retained after account deletion)',
  'USER',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;
