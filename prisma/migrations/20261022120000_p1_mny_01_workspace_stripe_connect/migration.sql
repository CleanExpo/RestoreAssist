-- P1-MNY-01: the firm's own Stripe account (Connect, Standard) on Workspace.
--
-- Additive only: four new columns, all nullable or defaulted, plus a unique
-- index so one Stripe account can never belong to two workspaces. No backfill:
-- no workspace has a connected account yet.
--
-- Rollback (manual, only if nothing has been onboarded yet):
--   DROP INDEX "Workspace_stripeConnectAccountId_key";
--   ALTER TABLE "Workspace" DROP COLUMN "stripeConnectAccountId",
--     DROP COLUMN "stripeConnectChargesEnabled",
--     DROP COLUMN "stripeConnectDetailsSubmitted",
--     DROP COLUMN "stripeConnectStatusAt";

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "stripeConnectAccountId" TEXT,
ADD COLUMN     "stripeConnectChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeConnectDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeConnectStatusAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_stripeConnectAccountId_key" ON "Workspace"("stripeConnectAccountId");
