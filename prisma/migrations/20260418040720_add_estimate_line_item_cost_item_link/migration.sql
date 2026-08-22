-- Add catalog linkage between EstimateLineItem and CostItem so custom line items
-- added inside an estimate can be promoted to the user's reusable CostLibrary
-- and surfaced on future jobs (RA-line-item-catalog-persistence).

ALTER TABLE "EstimateLineItem" ADD COLUMN "sourceCostItemId" TEXT;

CREATE INDEX "EstimateLineItem_sourceCostItemId_idx" ON "EstimateLineItem"("sourceCostItemId");

ALTER TABLE "EstimateLineItem"
  ADD CONSTRAINT "EstimateLineItem_sourceCostItemId_fkey"
  FOREIGN KEY ("sourceCostItemId") REFERENCES "CostItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
