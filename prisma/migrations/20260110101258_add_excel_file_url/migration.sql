-- AlterTable
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "excelReportUrl" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "inspectionPdfUrl" TEXT;
