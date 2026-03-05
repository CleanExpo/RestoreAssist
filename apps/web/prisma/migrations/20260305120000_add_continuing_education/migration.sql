-- CreateTable
CREATE TABLE "ContinuingEducation" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "cecPoints" DOUBLE PRECISION NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "certificateUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContinuingEducation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContinuingEducation_contractorId_idx" ON "ContinuingEducation"("contractorId");

-- CreateIndex
CREATE INDEX "ContinuingEducation_provider_idx" ON "ContinuingEducation"("provider");

-- CreateIndex
CREATE INDEX "ContinuingEducation_completedAt_idx" ON "ContinuingEducation"("completedAt");

-- AddForeignKey
ALTER TABLE "ContinuingEducation" ADD CONSTRAINT "ContinuingEducation_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "ContractorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
