-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('YES_NO', 'MULTIPLE_CHOICE', 'TEXT', 'NUMERIC', 'MEASUREMENT', 'LOCATION', 'MULTISELECT', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "SubscriptionTierLevel" AS ENUM ('STANDARD', 'PREMIUM', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "interviewTier" "SubscriptionTierLevel" DEFAULT 'STANDARD',
ADD COLUMN     "subscriptionTierId" TEXT;

-- CreateTable
CREATE TABLE "SubscriptionTier" (
    "id" TEXT NOT NULL,
    "tierName" "SubscriptionTierLevel" NOT NULL,
    "monthlyPrice" DOUBLE PRECISION NOT NULL,
    "features" TEXT,
    "standardsCoverage" TEXT[],
    "maxFormsPerMonth" INTEGER,
    "maxQuestionsPerInterview" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "helperText" TEXT,
    "exampleAnswer" TEXT,
    "sequenceNumber" INTEGER,
    "standardsReference" TEXT[],
    "standardsJustification" TEXT NOT NULL,
    "targetFormFields" TEXT[],
    "fieldMappings" TEXT NOT NULL,
    "condition" TEXT,
    "skipLogic" TEXT,
    "conditionalShows" TEXT,
    "fieldGuidance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minTierLevel" "SubscriptionTierLevel" NOT NULL DEFAULT 'STANDARD',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "averageTimeSeconds" INTEGER,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formTemplateId" TEXT NOT NULL,
    "formSubmissionId" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    "totalQuestionsAsked" INTEGER NOT NULL DEFAULT 0,
    "totalAnswersGiven" INTEGER NOT NULL DEFAULT 0,
    "estimatedTimeMinutes" INTEGER NOT NULL DEFAULT 5,
    "actualTimeMinutes" INTEGER,
    "answers" TEXT,
    "autoPopulatedFields" TEXT,
    "standardsReferences" TEXT,
    "equipmentRecommendations" TEXT,
    "estimatedEquipmentCost" DOUBLE PRECISION,
    "userTierLevel" "SubscriptionTierLevel" NOT NULL,
    "technicianExperience" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewResponse" (
    "id" TEXT NOT NULL,
    "interviewSessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerValue" TEXT,
    "answerType" "QuestionType" NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeSpentSeconds" INTEGER,
    "populatedFields" TEXT,
    "standardsReference" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewStandardsMapping" (
    "id" TEXT NOT NULL,
    "interviewSessionId" TEXT NOT NULL,
    "standardCode" TEXT NOT NULL,
    "standardTitle" TEXT NOT NULL,
    "questionsUsing" TEXT[],
    "fieldsAffected" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewStandardsMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionTier_tierName_idx" ON "SubscriptionTier"("tierName");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionTier_tierName_key" ON "SubscriptionTier"("tierName");

-- CreateIndex
CREATE INDEX "InterviewQuestion_sequenceNumber_idx" ON "InterviewQuestion"("sequenceNumber");

-- CreateIndex
CREATE INDEX "InterviewQuestion_minTierLevel_idx" ON "InterviewQuestion"("minTierLevel");

-- CreateIndex
CREATE INDEX "InterviewQuestion_isActive_idx" ON "InterviewQuestion"("isActive");

-- CreateIndex
CREATE INDEX "InterviewSession_userId_idx" ON "InterviewSession"("userId");

-- CreateIndex
CREATE INDEX "InterviewSession_status_idx" ON "InterviewSession"("status");

-- CreateIndex
CREATE INDEX "InterviewSession_createdAt_idx" ON "InterviewSession"("createdAt");

-- CreateIndex
CREATE INDEX "InterviewSession_formTemplateId_idx" ON "InterviewSession"("formTemplateId");

-- CreateIndex
CREATE INDEX "InterviewResponse_interviewSessionId_idx" ON "InterviewResponse"("interviewSessionId");

-- CreateIndex
CREATE INDEX "InterviewResponse_questionId_idx" ON "InterviewResponse"("questionId");

-- CreateIndex
CREATE INDEX "InterviewStandardsMapping_interviewSessionId_idx" ON "InterviewStandardsMapping"("interviewSessionId");

-- CreateIndex
CREATE INDEX "InterviewStandardsMapping_standardCode_idx" ON "InterviewStandardsMapping"("standardCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_subscriptionTierId_fkey" FOREIGN KEY ("subscriptionTierId") REFERENCES "SubscriptionTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewResponse" ADD CONSTRAINT "InterviewResponse_interviewSessionId_fkey" FOREIGN KEY ("interviewSessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
