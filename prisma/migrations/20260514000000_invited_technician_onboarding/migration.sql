-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- AlterTable
ALTER TABLE "Authorisation" ADD COLUMN "whsCardNumber" TEXT,
ADD COLUMN "whsCardExpiry" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Authorisation_subjectUserId_verifiedAt_idx" ON "Authorisation"("subjectUserId", "verifiedAt" DESC);
