#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repo, path), "utf8");
const failures = [];

function requireText(path, text, reason) {
  if (!read(path).includes(text)) failures.push(`${path}: ${reason}`);
}

function forbidText(path, text, reason) {
  if (read(path).includes(text)) failures.push(`${path}: ${reason}`);
}

const reportRoutes = [
  "app/api/inspections/[id]/report/route.ts",
  "app/api/reports/[id]/pdf/route.ts",
  "app/api/reports/generate-inspection-report/route.ts",
];
for (const path of reportRoutes) {
  forbidText(
    path,
    "floorPlanImageUrl",
    "legacy reference artwork must never enter a report",
  );
}
forbidText(
  "lib/reports/claim-sketch-floors.ts",
  "uploadedFloorPlanToFloor",
  "reference artwork must not have an export adapter",
);

const underlayRoute = "app/api/inspections/[id]/sketches/underlay/route.ts";
for (const required of [
  "assertInspectionTenancy",
  "evaluateUnderlayAttestation",
  "prepareUnderlayBytes",
  "contentSha256",
  "sketchUnderlayReference.create",
  "removeStoredUnderlay",
  "FEATURE_UNAVAILABLE",
  "renderedPngUrl: null",
]) {
  requireText(underlayRoute, required, `missing custody control ${required}`);
}

const legacySketchRoute =
  "app/api/inspections/[id]/sketches/[sketchId]/route.ts";
forbidText(
  legacySketchRoute,
  "backgroundImageUrl:",
  "legacy partial update can bypass content-bound underlay custody",
);
requireText(
  legacySketchRoute,
  "partial sketch update endpoint is retired",
  "legacy partial update must fail closed",
);

forbidText(
  "lib/sketch/commit-underlay-import.ts",
  "/api/sketch/underlay-attestation",
  "client-side upload + stdout attestation split is forgeable",
);
requireText(
  "app/api/sketch/underlay-attestation/route.ts",
  "inspection-scoped floor-plan import",
  "legacy unbound attestation endpoint must remain retired",
);

requireText(
  "app/api/inspections/[id]/sketches/route.ts",
  "requestCanonicalRender === true",
  "canonical PNGs must be generated as part of the tenant-checked sketch save",
);
requireText(
  "app/api/inspections/[id]/sketches/route.ts",
  "evaluateUnderlayVerification",
  "server verification gate is missing",
);
requireText(
  "app/api/inspections/[id]/sketches/route.ts",
  "storeVerifiedCleanRender",
  "verified underlay reports must use a source-free server render",
);
requireText(
  "lib/reports/claim-sketch-floors.ts",
  "underlayReferences",
  "clean export must consult durable underlay verification",
);
requireText(
  "lib/reports/claim-sketch-floors.ts",
  "isClaimSketchExportEligible",
  "clean export must bind the render path and hash to its verification receipt",
);
for (const required of [
  "exports\\/verified\\/floor-",
  "sketchUnderlayReferences",
  "stableStringify",
]) {
  requireText(
    "lib/reports/claim-sketch-floors.ts",
    required,
    `canonical export history control is missing (${required})`,
  );
}
for (const path of [
  "app/api/reports/generate-inspection-report/route.ts",
  "lib/reports/completeness.ts",
]) {
  requireText(
    path,
    "isClaimSketchExportEligible",
    "report and completeness paths must enforce content-bound export eligibility",
  );
}

const cleanRender = "lib/sketch/server-clean-render.ts";
for (const required of ["renderSha256", "/verified/", "upsert: false"]) {
  requireText(
    cleanRender,
    required,
    `verified clean renders must remain immutable and content-bound (${required})`,
  );
}

requireText(
  "components/sketch/SketchEditorV2.tsx",
  "requestCanonicalRender",
  "the editor must request a source-free server render",
);
for (const forbidden of ["uploadRenderedSketch(", "/sketches/render"]) {
  forbidText(
    "components/sketch/SketchEditorV2.tsx",
    forbidden,
    "the editor must not upload browser-rendered report pixels",
  );
}
requireText(
  "app/api/inspections/[id]/sketches/render/route.ts",
  "Client PNG render upload is retired",
  "the legacy arbitrary PNG endpoint must fail closed",
);
forbidText(
  "app/api/inspections/[id]/sketches/render/route.ts",
  "request.formData()",
  "the retired render endpoint must not consume attacker-supplied PNG bytes",
);
requireText(
  "app/api/inspections/[id]/sketches/route.ts",
  "stableStringify(securedSketchData)",
  "verification receipts must survive JSONB key reordering",
);

const pinRoute =
  "app/api/inspections/[id]/sketches/[sketchId]/evidence-pins/[pinId]/route.ts";
requireText(
  pinRoute,
  "sketch: { inspectionId: id }",
  "pin mutation must bind the pin's sketch to the inspection",
);
requireText(
  pinRoute,
  "where: { id: sketchRoomId, sketchId }",
  "pin room changes must bind the room to the sketch",
);

const storageMigration =
  "supabase/migrations/20260828103500_track_b_sketch_media_tenant_storage.sql";
for (const required of [
  "INSERT INTO storage.buckets",
  "ON CONFLICT (id) DO UPDATE SET",
  "file_size_limit = EXCLUDED.file_size_limit",
  "allowed_mime_types = EXCLUDED.allowed_mime_types",
  'DROP POLICY IF EXISTS "sketch-media: authenticated can select"',
  "split_part(name, '/', 2)",
  "public.is_workspace_member",
  "IN ('photos', 'exports')",
  "split_part(name, '/', 4) <> 'verified'",
]) {
  requireText(
    storageMigration,
    required,
    `missing tenant storage control ${required}`,
  );
}

requireText(
  "prisma/migrations/20260828103000_sketch_underlay_custody/migration.sql",
  'CREATE TRIGGER "SketchUnderlayReference_same_inspection"',
  "database must reject a custody row linked to a foreign inspection sketch",
);
forbidText(
  "prisma/migrations/20260828103000_sketch_underlay_custody/migration.sql",
  "inspectionId_floorNumber_contentSha256_key",
  "identical re-imports must create a new custody/attestation event",
);
for (const table of ["SketchRoom", "EvidencePin"]) {
  requireText(
    "prisma/migrations/20260828103000_sketch_underlay_custody/migration.sql",
    `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
    `${table} must remain default-deny to browser database roles`,
  );
}

if (failures.length) {
  console.error("Floor-plan custody gate FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Floor-plan custody gate passed (reference custody, tenancy, verification, clean export).",
);
