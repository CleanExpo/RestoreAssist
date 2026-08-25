ALTER TABLE "UserInvite"
  ADD COLUMN "acceptedUserId" TEXT,
  ADD COLUMN "acceptanceProvider" TEXT;

CREATE INDEX "UserInvite_acceptedUserId_idx"
  ON "UserInvite"("acceptedUserId");
