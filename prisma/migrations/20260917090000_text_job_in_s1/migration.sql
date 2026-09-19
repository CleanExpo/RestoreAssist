-- Text the Job In, slice 1: two new tables, nothing else.
--
-- WHAT IT ADDS
--   MessagingIdentity  a chat account (Telegram in S1) a user has linked by
--                      texting a one-time code. Unique on (channel, address).
--   InboundJobMessage  one row per message a linked technician texts in,
--                      filed against their organisation and, when a job could
--                      be picked, an inspection. externalId is unique so a
--                      provider redelivery can never be filed twice.
--
-- ADDITIVE
--   Every statement is CREATE TABLE, CREATE INDEX, ADD CONSTRAINT or ENABLE
--   ROW LEVEL SECURITY against a table this migration creates. Nothing that
--   existed before is altered, renamed, retyped or dropped.
--   `bash scripts/ci/migration-roundtrip.sh additive-only` checks that.
--
--   Generated with
--     prisma migrate diff --from-schema <schema.prisma at origin/main>
--                         --to-schema   prisma/schema.prisma --script
--   for the same reason as 20260907030000: diffing from the migration history
--   drags in pre-existing drift that is not this branch's.
--
-- RLS: SERVICE-ONLY, DEFAULT-DENY
--   Both tables are written and read only by server route handlers (the
--   messaging webhook and the link-code route). RLS is enabled with NO
--   policies, so no client role can read or write them. Same posture as the
--   pilot ledgers in 20260825090000. Listed in SERVICE_ONLY in
--   scripts/audit-rls-coverage.ts.
--
-- REVERSIBLE
--   down.sql drops exactly the two tables this file creates.

-- CreateTable
CREATE TABLE "MessagingIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundJobMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaRefs" JSONB NOT NULL DEFAULT '[]',
    "parsed" JSONB,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundJobMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagingIdentity_userId_idx" ON "MessagingIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingIdentity_channel_address_key" ON "MessagingIdentity"("channel", "address");

-- CreateIndex
CREATE UNIQUE INDEX "InboundJobMessage_externalId_key" ON "InboundJobMessage"("externalId");

-- CreateIndex
CREATE INDEX "InboundJobMessage_organizationId_userId_status_createdAt_idx" ON "InboundJobMessage"("organizationId", "userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "InboundJobMessage_inspectionId_idx" ON "InboundJobMessage"("inspectionId");

-- AddForeignKey
ALTER TABLE "MessagingIdentity" ADD CONSTRAINT "MessagingIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundJobMessage" ADD CONSTRAINT "InboundJobMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundJobMessage" ADD CONSTRAINT "InboundJobMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundJobMessage" ADD CONSTRAINT "InboundJobMessage_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Server-only tables: RLS on, no policies (default-deny for client roles).
ALTER TABLE "MessagingIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboundJobMessage" ENABLE ROW LEVEL SECURITY;
