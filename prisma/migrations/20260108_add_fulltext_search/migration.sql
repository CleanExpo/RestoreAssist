-- Add tsvector columns for full-text search
ALTER TABLE "Report" ADD COLUMN "search_vector" tsvector;
ALTER TABLE "Client" ADD COLUMN "search_vector" tsvector;
ALTER TABLE "Inspection" ADD COLUMN "search_vector" tsvector;

-- Create GIN indexes for fast full-text search
CREATE INDEX "Report_search_vector_gin" ON "Report" USING GIN ("search_vector");
CREATE INDEX "Client_search_vector_gin" ON "Client" USING GIN ("search_vector");
CREATE INDEX "Inspection_search_vector_gin" ON "Inspection" USING GIN ("search_vector");

-- Create trigger function for Report search_vector updates
CREATE OR REPLACE FUNCTION update_report_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW."search_vector" := to_tsvector('english',
    COALESCE(NEW."reportNumber", '') || ' ' ||
    COALESCE(NEW."clientName", '') || ' ' ||
    COALESCE(NEW."propertyAddress", '') || ' ' ||
    COALESCE(NEW."hazardType", '') || ' ' ||
    COALESCE(NEW."waterCategory", '') || ' ' ||
    COALESCE(NEW."description", '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for Report on INSERT
CREATE TRIGGER report_search_vector_insert
BEFORE INSERT ON "Report"
FOR EACH ROW
EXECUTE FUNCTION update_report_search_vector();

-- Create trigger for Report on UPDATE
CREATE TRIGGER report_search_vector_update
BEFORE UPDATE ON "Report"
FOR EACH ROW
EXECUTE FUNCTION update_report_search_vector();

-- Create trigger function for Client search_vector updates
CREATE OR REPLACE FUNCTION update_client_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW."search_vector" := to_tsvector('english',
    COALESCE(NEW."name", '') || ' ' ||
    COALESCE(NEW."email", '') || ' ' ||
    COALESCE(NEW."phone", '') || ' ' ||
    COALESCE(NEW."company", '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for Client on INSERT
CREATE TRIGGER client_search_vector_insert
BEFORE INSERT ON "Client"
FOR EACH ROW
EXECUTE FUNCTION update_client_search_vector();

-- Create trigger for Client on UPDATE
CREATE TRIGGER client_search_vector_update
BEFORE UPDATE ON "Client"
FOR EACH ROW
EXECUTE FUNCTION update_client_search_vector();

-- Create trigger function for Inspection search_vector updates
CREATE OR REPLACE FUNCTION update_inspection_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW."search_vector" := to_tsvector('english',
    COALESCE(NEW."inspectionNumber", '') || ' ' ||
    COALESCE(NEW."propertyAddress", '') || ' ' ||
    COALESCE(NEW."technicianName", '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for Inspection on INSERT
CREATE TRIGGER inspection_search_vector_insert
BEFORE INSERT ON "Inspection"
FOR EACH ROW
EXECUTE FUNCTION update_inspection_search_vector();

-- Create trigger for Inspection on UPDATE
CREATE TRIGGER inspection_search_vector_update
BEFORE UPDATE ON "Inspection"
FOR EACH ROW
EXECUTE FUNCTION update_inspection_search_vector();

-- Backfill existing Report data
UPDATE "Report" SET "search_vector" = to_tsvector('english',
  COALESCE("reportNumber", '') || ' ' ||
  COALESCE("clientName", '') || ' ' ||
  COALESCE("propertyAddress", '') || ' ' ||
  COALESCE("hazardType", '') || ' ' ||
  COALESCE("waterCategory", '') || ' ' ||
  COALESCE("description", '')
)
WHERE "search_vector" IS NULL;

-- Backfill existing Client data
UPDATE "Client" SET "search_vector" = to_tsvector('english',
  COALESCE("name", '') || ' ' ||
  COALESCE("email", '') || ' ' ||
  COALESCE("phone", '') || ' ' ||
  COALESCE("company", '')
)
WHERE "search_vector" IS NULL;

-- Backfill existing Inspection data
UPDATE "Inspection" SET "search_vector" = to_tsvector('english',
  COALESCE("inspectionNumber", '') || ' ' ||
  COALESCE("propertyAddress", '') || ' ' ||
  COALESCE("technicianName", '')
)
WHERE "search_vector" IS NULL;
