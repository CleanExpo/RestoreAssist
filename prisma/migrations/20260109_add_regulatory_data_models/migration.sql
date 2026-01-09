-- CreateEnum
CREATE TYPE "RegulatoryDocumentType" AS ENUM ('INSURANCE_POLICY', 'INSURANCE_REGULATION', 'BUILDING_CODE_NATIONAL', 'BUILDING_CODE_STATE', 'ELECTRICAL_STANDARD', 'PLUMBING_STANDARD', 'CONSUMER_LAW', 'INDUSTRY_BEST_PRACTICE', 'SAFETY_REGULATION');

-- AlterTable
ALTER TABLE "BuildingCode" ADD COLUMN "regulatoryDocumentId" TEXT;

-- CreateTable
CREATE TABLE "RegulatoryDocument" (
    "id" TEXT NOT NULL,
    "documentType" "RegulatoryDocumentType" NOT NULL,
    "category" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "title" TEXT NOT NULL,
    "documentCode" TEXT,
    "version" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "googleDriveFileId" TEXT,
    "extractedText" TEXT,
    "publisher" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatorySection" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sectionNumber" TEXT NOT NULL,
    "sectionTitle" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "topics" TEXT[],
    "keywords" TEXT[],
    "applicableToWaterCategory" TEXT[],
    "applicableToWaterClass" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatorySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fullReference" TEXT NOT NULL,
    "shortReference" TEXT NOT NULL,
    "citationText" TEXT NOT NULL,
    "contextKeywords" TEXT[],
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicyRequirement" (
    "id" TEXT NOT NULL,
    "insurerName" TEXT,
    "requirementType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "applicableStates" TEXT[],
    "standardReference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePolicyRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegulatoryDocument_documentType_jurisdiction_idx" ON "RegulatoryDocument"("documentType", "jurisdiction");

-- CreateIndex
CREATE INDEX "RegulatoryDocument_documentCode_idx" ON "RegulatoryDocument"("documentCode");

-- CreateIndex
CREATE INDEX "RegulatorySection_documentId_sectionNumber_idx" ON "RegulatorySection"("documentId", "sectionNumber");

-- CreateIndex
CREATE INDEX "RegulatorySection_topics_idx" ON "RegulatorySection"("topics");

-- CreateIndex
CREATE INDEX "Citation_shortReference_idx" ON "Citation"("shortReference");

-- CreateIndex
CREATE INDEX "InsurancePolicyRequirement_insurerName_idx" ON "InsurancePolicyRequirement"("insurerName");

-- CreateIndex
CREATE INDEX "BuildingCode_regulatoryDocumentId_idx" ON "BuildingCode"("regulatoryDocumentId");

-- AddForeignKey
ALTER TABLE "BuildingCode" ADD CONSTRAINT "BuildingCode_regulatoryDocumentId_fkey" FOREIGN KEY ("regulatoryDocumentId") REFERENCES "RegulatoryDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatorySection" ADD CONSTRAINT "RegulatorySection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RegulatoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RegulatoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
