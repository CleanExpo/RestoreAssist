-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "reportId" TEXT;

-- CreateIndex
CREATE INDEX "InterviewSession_reportId_idx" ON "InterviewSession"("reportId");

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
