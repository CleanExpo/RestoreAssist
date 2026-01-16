-- CreateEnum
CREATE TYPE "AuthorityFormStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURES', 'PARTIALLY_SIGNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuthoritySignatoryRole" AS ENUM ('CLIENT', 'INSURER', 'CONTRACTOR', 'ADMIN', 'TECHNICIAN', 'MANAGER', 'PROPERTY_OWNER');

-- CreateTable
CREATE TABLE "AuthorityFormTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "formContent" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorityFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityFormInstance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyLogo" TEXT,
    "companyABN" TEXT,
    "companyPhone" TEXT,
    "companyEmail" TEXT,
    "companyWebsite" TEXT,
    "companyAddress" TEXT,
    "clientName" TEXT NOT NULL,
    "clientAddress" TEXT NOT NULL,
    "incidentBrief" TEXT,
    "incidentDate" TIMESTAMP(3),
    "authorityDescription" TEXT NOT NULL,
    "status" "AuthorityFormStatus" NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "draftPdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AuthorityFormInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityFormSignature" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "signatoryName" TEXT NOT NULL,
    "signatoryRole" "AuthoritySignatoryRole" NOT NULL,
    "signatoryEmail" TEXT,
    "signatoryPhone" TEXT,
    "signatureData" TEXT,
    "signatureUrl" TEXT,
    "signatureRequestSent" BOOLEAN NOT NULL DEFAULT false,
    "signatureRequestSentAt" TIMESTAMP(3),
    "signatureRequestToken" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorityFormSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthorityFormTemplate_code_key" ON "AuthorityFormTemplate"("code");

-- CreateIndex
CREATE INDEX "AuthorityFormTemplate_code_idx" ON "AuthorityFormTemplate"("code");

-- CreateIndex
CREATE INDEX "AuthorityFormTemplate_isActive_idx" ON "AuthorityFormTemplate"("isActive");

-- CreateIndex
CREATE INDEX "AuthorityFormInstance_reportId_idx" ON "AuthorityFormInstance"("reportId");

-- CreateIndex
CREATE INDEX "AuthorityFormInstance_templateId_idx" ON "AuthorityFormInstance"("templateId");

-- CreateIndex
CREATE INDEX "AuthorityFormInstance_status_idx" ON "AuthorityFormInstance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorityFormSignature_signatureRequestToken_key" ON "AuthorityFormSignature"("signatureRequestToken");

-- CreateIndex
CREATE INDEX "AuthorityFormSignature_instanceId_idx" ON "AuthorityFormSignature"("instanceId");

-- CreateIndex
CREATE INDEX "AuthorityFormSignature_signatoryRole_idx" ON "AuthorityFormSignature"("signatoryRole");

-- CreateIndex
CREATE INDEX "AuthorityFormSignature_signatureRequestToken_idx" ON "AuthorityFormSignature"("signatureRequestToken");

-- AddForeignKey
ALTER TABLE "AuthorityFormInstance" ADD CONSTRAINT "AuthorityFormInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AuthorityFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityFormInstance" ADD CONSTRAINT "AuthorityFormInstance_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityFormSignature" ADD CONSTRAINT "AuthorityFormSignature_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "AuthorityFormInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
