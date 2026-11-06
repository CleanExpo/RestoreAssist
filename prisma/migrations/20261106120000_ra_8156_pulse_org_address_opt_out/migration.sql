-- RA-8156: organisation-wide Pulse address consent lock.
--
-- WHY
--   Client.pulseOptOut is the person's flag on one client row. Matching that
--   flag to the current email, and scoping the match to job.userId, let a
--   colleague in the same firm keep mailing an address that already withdrew,
--   and let a contractor resume mail by moving the email onto a new row.
--
-- WHAT IT ADDS
--   PulseOrgAddressOptOut keyed by (organizationId, addressTag). addressTag is
--   the HMAC fingerprint already used on unsubscribe tokens, not the raw
--   address. No foreign keys to Client or User: deleting those rows must not
--   restore mail. Existing Client.pulseOptOut rows stay; readers honour them
--   for current and former members until a write promotes them into this table.
--
-- ADDITIVE
--   CreateTable plus unique and lookup indexes. No backfill in SQL: the tag
--   needs the app HMAC secret, so promotion is a backward-compatible read.
--
-- REVERSIBLE
--   DROP TABLE "PulseOrgAddressOptOut";

-- CreateTable
CREATE TABLE "PulseOrgAddressOptOut" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "addressTag" TEXT NOT NULL,
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceClientId" TEXT,
    "sourceUserId" TEXT,

    CONSTRAINT "PulseOrgAddressOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PulseOrgAddressOptOut_organizationId_addressTag_key" ON "PulseOrgAddressOptOut"("organizationId", "addressTag");

-- CreateIndex
CREATE INDEX "PulseOrgAddressOptOut_addressTag_idx" ON "PulseOrgAddressOptOut"("addressTag");

-- CreateIndex
CREATE INDEX "PulseOrgAddressOptOut_organizationId_idx" ON "PulseOrgAddressOptOut"("organizationId");

-- AddForeignKey
ALTER TABLE "PulseOrgAddressOptOut" ADD CONSTRAINT "PulseOrgAddressOptOut_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
