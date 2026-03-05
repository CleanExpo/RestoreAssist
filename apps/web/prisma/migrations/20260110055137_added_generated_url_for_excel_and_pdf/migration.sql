-- CreateIndex
CREATE INDEX "Estimate_reportId_createdAt_idx" ON "Estimate"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_userId_createdAt_idx" ON "Report"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_userId_hazardType_idx" ON "Report"("userId", "hazardType");

-- CreateIndex
CREATE INDEX "Report_userId_status_idx" ON "Report"("userId", "status");

-- CreateIndex
CREATE INDEX "Report_clientId_createdAt_idx" ON "Report"("clientId", "createdAt");

-- RenameIndex
ALTER INDEX "Client_search_vector_gin" RENAME TO "Client_search_vector_idx";

-- RenameIndex
ALTER INDEX "Inspection_search_vector_gin" RENAME TO "Inspection_search_vector_idx";

-- RenameIndex
ALTER INDEX "Report_search_vector_gin" RENAME TO "Report_search_vector_idx";
