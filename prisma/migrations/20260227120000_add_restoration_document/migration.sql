-- CreateTable
CREATE TABLE "RestorationDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestorationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestorationDocument_userId_idx" ON "RestorationDocument"("userId");

-- CreateIndex
CREATE INDEX "RestorationDocument_reportId_idx" ON "RestorationDocument"("reportId");

-- CreateIndex
CREATE INDEX "RestorationDocument_userId_documentType_idx" ON "RestorationDocument"("userId", "documentType");

-- CreateIndex
CREATE INDEX "RestorationDocument_createdAt_idx" ON "RestorationDocument"("createdAt");

-- AddForeignKey
ALTER TABLE "RestorationDocument" ADD CONSTRAINT "RestorationDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationDocument" ADD CONSTRAINT "RestorationDocument_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
