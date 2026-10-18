-- P2 / RLS batch 4 (MoistureReading) — tenant isolation via inspection workspace.
-- Service role bypasses RLS; browser clients use server APIs.

ALTER TABLE IF EXISTS "MoistureReading" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moisture_reading_tenant_select" ON "MoistureReading";
CREATE POLICY "moisture_reading_tenant_select"
  ON "MoistureReading"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "Inspection" i
      WHERE i.id = "MoistureReading"."inspectionId"
        AND i."userId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "moisture_reading_service_all" ON "MoistureReading";
CREATE POLICY "moisture_reading_service_all"
  ON "MoistureReading"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
