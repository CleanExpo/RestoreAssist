-- Mining pilot slice 6: staff training register.
--
-- Additive only: one new table with its indexes, foreign keys and value
-- checks. No existing table, column or type is changed. Reverse: down.sql in
-- this folder.
--
-- Both foreign keys are ON DELETE CASCADE: a record belongs to one
-- organisation and one staff member, and goes when either is deleted. A staff
-- member who leaves the organisation (User.organizationId cleared) keeps the
-- row, so the employer's register still shows the training they recorded.

-- CreateTable
CREATE TABLE "StaffTrainingRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "completedOn" DATE NOT NULL,
    "expiresOn" DATE,
    "evidenceUrl" TEXT,
    "carsiCompletionRef" TEXT,
    "recordedByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffTrainingRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffTrainingRecord_expiry_check" CHECK ("expiresOn" IS NULL OR "expiresOn" >= "completedOn"),
    CONSTRAINT "StaffTrainingRecord_course_check" CHECK (char_length("course") BETWEEN 1 AND 200),
    CONSTRAINT "StaffTrainingRecord_provider_check" CHECK (char_length("provider") BETWEEN 1 AND 200),
    CONSTRAINT "StaffTrainingRecord_evidenceUrl_check" CHECK ("evidenceUrl" IS NULL OR char_length("evidenceUrl") <= 2048),
    CONSTRAINT "StaffTrainingRecord_carsiCompletionRef_check" CHECK ("carsiCompletionRef" IS NULL OR char_length("carsiCompletionRef") <= 2048)
);

-- CreateIndex
CREATE INDEX "StaffTrainingRecord_organizationId_staffUserId_idx" ON "StaffTrainingRecord"("organizationId", "staffUserId");

-- CreateIndex
CREATE INDEX "StaffTrainingRecord_staffUserId_idx" ON "StaffTrainingRecord"("staffUserId");

-- AddForeignKey
ALTER TABLE "StaffTrainingRecord" ADD CONSTRAINT "StaffTrainingRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTrainingRecord" ADD CONSTRAINT "StaffTrainingRecord_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default-deny for the Supabase API roles, as every tenant table has; the app
-- reaches this table through Prisma as the table owner.
ALTER TABLE "StaffTrainingRecord" ENABLE ROW LEVEL SECURITY;
