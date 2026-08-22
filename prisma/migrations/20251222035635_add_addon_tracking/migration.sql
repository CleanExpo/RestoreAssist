-- AlterTable
ALTER TABLE "User" ADD COLUMN     "addonReports" INTEGER DEFAULT 0,
ADD COLUMN     "monthlyReportsUsed" INTEGER DEFAULT 0,
ADD COLUMN     "monthlyResetDate" TIMESTAMP(3);
