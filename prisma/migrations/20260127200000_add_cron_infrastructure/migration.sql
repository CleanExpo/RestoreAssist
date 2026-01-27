-- AddCronInfrastructure: Add scheduling fields, email content fields, and CronJobRun model

-- Add scheduling fields to AgentWorkflow
ALTER TABLE "AgentWorkflow" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);
ALTER TABLE "AgentWorkflow" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);

-- Create ScheduledEmail table if it doesn't exist
CREATE TABLE IF NOT EXISTS "ScheduledEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttempt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledEmail_pkey" PRIMARY KEY ("id")
);

-- Add email content fields to ScheduledEmail (with IF NOT EXISTS for idempotency)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ScheduledEmail' AND column_name = 'subject') THEN
        ALTER TABLE "ScheduledEmail" ADD COLUMN "subject" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ScheduledEmail' AND column_name = 'htmlBody') THEN
        ALTER TABLE "ScheduledEmail" ADD COLUMN "htmlBody" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ScheduledEmail' AND column_name = 'textBody') THEN
        ALTER TABLE "ScheduledEmail" ADD COLUMN "textBody" TEXT;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "ScheduledEmail_userId_idx" ON "ScheduledEmail"("userId");
CREATE INDEX IF NOT EXISTS "ScheduledEmail_reportId_idx" ON "ScheduledEmail"("reportId");
CREATE INDEX IF NOT EXISTS "ScheduledEmail_status_scheduledAt_idx" ON "ScheduledEmail"("status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "ScheduledEmail_scheduledAt_idx" ON "ScheduledEmail"("scheduledAt");

-- Add foreign keys if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'ScheduledEmail_userId_fkey' AND table_name = 'ScheduledEmail'
    ) THEN
        ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'ScheduledEmail_reportId_fkey' AND table_name = 'ScheduledEmail'
    ) THEN
        ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- CreateTable: CronJobRun
CREATE TABLE "CronJobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "metadata" TEXT,

    CONSTRAINT "CronJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CronJobRun_jobName_startedAt_idx" ON "CronJobRun"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "CronJobRun_status_idx" ON "CronJobRun"("status");
