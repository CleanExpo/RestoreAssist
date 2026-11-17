/**
 * RA-8440 — guard for unique keys that contain an optional column.
 *
 * Postgres treats NULLs as distinct, so such a key does not stop duplicates.
 * The guard fails unless each key carries a recorded decision. These tests
 * prove it goes red on a planted model and on the real schema with a
 * decision removed, and that it is green on the committed schema.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — pure ESM helper module, no type declarations.
import { checkNullableUniqueKeys, findNullableUniqueKeys } from "../check-nullable-unique-keys.mjs";

const root = path.resolve(__dirname, "..", "..");
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const allowlist: Record<string, { kind: string }> = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/nullable-unique-keys.allowlist.json"), "utf8"),
).keys;
const readMigration = (rel: string) => {
  const p = path.join(root, "prisma/migrations", rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

const PLANTED = `
model PlantedQueueJob {
  id      String  @id
  orgId   String
  photoId String?
  slug    String? @unique
  @@unique([orgId, photoId])
}
`;

describe("nullable unique-key guard", () => {
  it("passes on the committed schema and allow-list", () => {
    expect(checkNullableUniqueKeys(schema, allowlist, readMigration)).toEqual([]);
  });

  it("finds the StorageMirrorJob idempotency key and lists it as a known defect", () => {
    const ids = findNullableUniqueKeys(schema).map((k: { id: string }) => k.id);
    const id = "StorageMirrorJob(inspectionId,invoiceId,kind,orgId,photoId,reportId)";
    expect(ids).toContain(id);
    expect(allowlist[id]).toMatchObject({ kind: "known-defect", ticket: "RA-8440" });
  });

  it("fails on a planted composite key with an optional column, and ignores the single-column one", () => {
    const v = checkNullableUniqueKeys(PLANTED, {}, readMigration);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/^PlantedQueueJob\(orgId,photoId\): .*photoId/);
  });

  it("fails on the real schema when one decision is removed", () => {
    const { ["Invoice(externalInvoiceId,externalSyncProvider)"]: _dropped, ...rest } = allowlist;
    const v = checkNullableUniqueKeys(schema, rest, readMigration);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/^Invoice\(externalInvoiceId,externalSyncProvider\): /);
  });

  it("fails on a stale entry, a reasonless exemption, a ticketless defect and an unproven migration", () => {
    const planted = "PlantedQueueJob(orgId,photoId)";
    expect(checkNullableUniqueKeys(PLANTED, { [planted]: { kind: "exempt" } }, readMigration)).toEqual([
      `${planted}: "exempt" needs a reason`,
    ]);
    expect(checkNullableUniqueKeys(PLANTED, { [planted]: { kind: "known-defect" } }, readMigration)[0]).toMatch(
      /needs a ticket/,
    );
    const noClause = () => "CREATE UNIQUE INDEX x ON y (a, b);";
    expect(
      checkNullableUniqueKeys(PLANTED, { [planted]: { kind: "nulls-not-distinct", migration: "m.sql" } }, noClause)[0],
    ).toMatch(/no NULLS NOT DISTINCT/);
    const withClause = () => "CREATE UNIQUE INDEX x ON y (a, b) NULLS NOT DISTINCT;";
    expect(
      checkNullableUniqueKeys(PLANTED, { [planted]: { kind: "nulls-not-distinct", migration: "m.sql" } }, withClause),
    ).toEqual([]);
    const stale = { ...allowlist, "Gone(a,b)": { kind: "exempt", reason: "x" } };
    expect(checkNullableUniqueKeys(schema, stale, readMigration)).toEqual([
      "Gone(a,b): allow-list entry has no matching nullable unique key in the schema; remove it",
    ]);
  });
});
