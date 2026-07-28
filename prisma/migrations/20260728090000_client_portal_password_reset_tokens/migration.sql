-- Secure homeowner portal password recovery with a client-scoped,
-- short-lived verification code.
CREATE TABLE "ClientPasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientPasswordResetToken_clientUserId_idx"
    ON "ClientPasswordResetToken"("clientUserId");
CREATE INDEX "ClientPasswordResetToken_email_idx"
    ON "ClientPasswordResetToken"("email");

ALTER TABLE "ClientPasswordResetToken"
    ADD CONSTRAINT "ClientPasswordResetToken_clientUserId_fkey"
    FOREIGN KEY ("clientUserId") REFERENCES "ClientUser"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
