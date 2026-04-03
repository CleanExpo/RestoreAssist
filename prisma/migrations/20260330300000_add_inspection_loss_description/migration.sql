-- AddColumn: lossDescription on Inspection
-- Stores free-text loss description from the NIR form.
-- Feeds the scope narrative generator (lossSourceDescription parameter).

ALTER TABLE "Inspection" ADD COLUMN "lossDescription" TEXT;
