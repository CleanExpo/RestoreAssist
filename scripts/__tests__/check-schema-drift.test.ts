/**
 * WS3 — Drift-gate extension tests (RA-1807 remediation spec §11/§14, AC-14/AC-15).
 *
 * Proves the extended gate detects unique-index and nullability drift, PER-OBJECT
 * and BIDIRECTIONALLY, against fixtures reproducing current prod and the
 * post-repair state. The AV-2 requirement is explicit: the three stale uniques
 * are all EXTRA-IN-DB, so a schema->DB-only diff (or one that only notices the
 * `category` nullability mismatch) would miss them — the tests below fail if that
 * regression is ever reintroduced.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — pure ESM helper module, no type declarations.
import {
  sig,
  parseSchemaObjects,
  extractIndexColumns,
  computeDrift,
} from "../check-schema-drift.mjs";

type Def = { columns: string[]; notNull: string[]; uniques: string[][] };
function shape(defs: Record<string, Def>) {
  const tables = Object.keys(defs);
  const columns = new Map<string, Set<string>>();
  const notNull = new Map<string, Set<string>>();
  const uniques = new Map<string, Set<string>>();
  for (const [t, d] of Object.entries(defs)) {
    columns.set(t, new Set(d.columns));
    notNull.set(t, new Set(d.notNull));
    uniques.set(t, new Set(d.uniques.map((cols) => sig(cols))));
  }
  return { tables, columns, notNull, uniques };
}

// Intended (schema) state: Integration multi-workspace unique only;
// EnvironmentalData is time-series (no unique); Xero.category is nullable.
const SCHEMA = shape({
  Integration: {
    columns: ["userId", "workspaceId", "provider"],
    notNull: ["userId", "workspaceId", "provider"],
    uniques: [["userId", "workspaceId", "provider"]],
  },
  EnvironmentalData: {
    columns: ["inspectionId", "reading"],
    notNull: ["inspectionId", "reading"],
    uniques: [],
  },
  XeroAccountCodeMapping: {
    columns: ["integrationId", "category", "damageType"],
    notNull: ["integrationId", "damageType"], // category NULLABLE
    uniques: [],
  },
});

// Current prod: stale narrow Integration unique kept, EnvironmentalData stale
// unique kept, Xero has a hidden extra unique + a prod-only NOT NULL userId +
// category is NOT NULL. (userId is the founder-gated carve-out; an extra-in-db
// column is tolerated, mirroring the original gate's tolerance.)
const PROD = shape({
  Integration: {
    columns: ["userId", "workspaceId", "provider"],
    notNull: ["userId", "workspaceId", "provider"],
    uniques: [
      ["userId", "provider"], // STALE — should have been dropped
      ["userId", "workspaceId", "provider"],
    ],
  },
  EnvironmentalData: {
    columns: ["inspectionId", "reading"],
    notNull: ["inspectionId", "reading"],
    uniques: [["inspectionId"]], // STALE
  },
  XeroAccountCodeMapping: {
    columns: ["integrationId", "category", "damageType", "userId"],
    notNull: ["integrationId", "category", "damageType", "userId"], // category NOT NULL = drift
    uniques: [["userId", "category", "damageType"]], // hidden 4th unique
  },
});

// After WS2 apply: uniques dropped, category nullable. userId stays prod-only
// (carved out of the autonomous migration) and is tolerated as extra-in-db.
const REPAIRED = shape({
  Integration: {
    columns: ["userId", "workspaceId", "provider"],
    notNull: ["userId", "workspaceId", "provider"],
    uniques: [["userId", "workspaceId", "provider"]],
  },
  EnvironmentalData: {
    columns: ["inspectionId", "reading"],
    notNull: ["inspectionId", "reading"],
    uniques: [],
  },
  XeroAccountCodeMapping: {
    columns: ["integrationId", "category", "damageType", "userId"],
    notNull: ["integrationId", "damageType", "userId"], // category now nullable
    uniques: [],
  },
});

const find = (
  drift: any[],
  table: string,
  kind: string,
  direction: string,
  object?: string,
) =>
  drift.find(
    (f) =>
      f.table === table &&
      f.kind === kind &&
      f.direction === direction &&
      (object === undefined || f.object === object),
  );

describe("WS3 drift gate", () => {
  describe("computeDrift on current-prod fixture (AC-15)", () => {
    const drift = computeDrift(SCHEMA, PROD);

    it("emits a DISTINCT finding per drifted object (not an aggregate)", () => {
      // Exactly the 4 known drift objects — three stale uniques + category.
      expect(drift).toHaveLength(4);
    });

    it("flags the stale Integration (userId, provider) unique as extra-in-db", () => {
      expect(
        find(drift, "Integration", "unique", "extra-in-db", sig(["userId", "provider"])),
      ).toBeTruthy();
    });

    it("flags the stale EnvironmentalData (inspectionId) unique as extra-in-db", () => {
      expect(
        find(drift, "EnvironmentalData", "unique", "extra-in-db", sig(["inspectionId"])),
      ).toBeTruthy();
    });

    it("flags the hidden Xero (userId, category, damageType) unique as extra-in-db", () => {
      expect(
        find(
          drift,
          "XeroAccountCodeMapping",
          "unique",
          "extra-in-db",
          sig(["userId", "category", "damageType"]),
        ),
      ).toBeTruthy();
    });

    it("flags the Xero.category NOT NULL mismatch individually", () => {
      const f = find(
        drift,
        "XeroAccountCodeMapping",
        "nullability",
        "nullability-mismatch",
        "category",
      );
      expect(f).toBeTruthy();
      expect(f.detail).toMatch(/nullable in schema but NOT NULL in DB/);
    });

    it("tolerates the prod-only userId column (founder-gated carve-out), not flagged as column drift", () => {
      expect(find(drift, "XeroAccountCodeMapping", "column", "missing-in-db")).toBeFalsy();
    });
  });

  describe("AV-2: uniques are detected independently of the nullability mismatch", () => {
    it("still flags all three stale uniques when category nullability matches", () => {
      const PROD_CAT_OK = shape({
        Integration: {
          columns: ["userId", "workspaceId", "provider"],
          notNull: ["userId", "workspaceId", "provider"],
          uniques: [["userId", "provider"], ["userId", "workspaceId", "provider"]],
        },
        EnvironmentalData: {
          columns: ["inspectionId", "reading"],
          notNull: ["inspectionId", "reading"],
          uniques: [["inspectionId"]],
        },
        XeroAccountCodeMapping: {
          columns: ["integrationId", "category", "damageType"],
          notNull: ["integrationId", "damageType"], // category nullable — matches schema
          uniques: [["userId", "category", "damageType"]],
        },
      });
      const drift = computeDrift(SCHEMA, PROD_CAT_OK);
      // No nullability finding, but the three stale uniques remain — an
      // aggregate/one-directional gate would have passed here.
      expect(drift.filter((f: any) => f.kind === "nullability")).toHaveLength(0);
      expect(drift.filter((f: any) => f.direction === "extra-in-db")).toHaveLength(3);
    });
  });

  describe("computeDrift on post-repair fixture", () => {
    it("PASSES (no drift) once the uniques are dropped and category is nullable", () => {
      expect(computeDrift(SCHEMA, REPAIRED)).toEqual([]);
    });
  });

  describe("bidirectionality — the other direction still works", () => {
    it("flags a schema unique missing from the DB (a no-op'd CREATE) as missing-in-db", () => {
      const dbNoUnique = shape({
        T: { columns: ["a"], notNull: ["a"], uniques: [] },
      });
      const schemaWithUnique = shape({
        T: { columns: ["a"], notNull: ["a"], uniques: [["a"]] },
      });
      const drift = computeDrift(schemaWithUnique, dbNoUnique);
      expect(find(drift, "T", "unique", "missing-in-db", sig(["a"]))).toBeTruthy();
    });

    it("flags a schema column missing from the DB (original guard)", () => {
      const schema = shape({ T: { columns: ["a", "b"], notNull: ["a", "b"], uniques: [] } });
      const db = shape({ T: { columns: ["a"], notNull: ["a"], uniques: [] } });
      expect(find(computeDrift(schema, db), "T", "column", "missing-in-db", "b")).toBeTruthy();
    });
  });

  describe("parseSchemaObjects (schema.prisma parsing)", () => {
    const parsed = parseSchemaObjects(`
model Integration {
  id          String @id
  userId      String
  workspaceId String
  provider    String
  note        String?
  @@unique([userId, workspaceId, provider])
}
model User {
  id    String @id
  email String @unique
}
`);
    it("parses composite @@unique into a sorted column signature", () => {
      expect(parsed.uniques.get("Integration")).toContain(
        sig(["userId", "workspaceId", "provider"]),
      );
    });
    it("parses field-level @unique", () => {
      expect(parsed.uniques.get("User")).toContain(sig(["email"]));
    });
    it("treats a `?` field as nullable and a bare field as NOT NULL", () => {
      expect(parsed.notNull.get("Integration")?.has("provider")).toBe(true);
      expect(parsed.notNull.get("Integration")?.has("note")).toBe(false);
    });
  });

  describe("extractIndexColumns (pg_indexes indexdef)", () => {
    it("extracts a unique index's sorted columns", () => {
      expect(
        extractIndexColumns(
          'CREATE UNIQUE INDEX "Integration_userId_provider_key" ON public."Integration" USING btree ("userId", "provider")',
        ),
      ).toBe(sig(["userId", "provider"]));
    });
    it("returns null for a non-unique index", () => {
      expect(
        extractIndexColumns(
          'CREATE INDEX "x" ON public."T" USING btree ("a")',
        ),
      ).toBeNull();
    });
    it("returns null for a partial unique index (WHERE) — cannot compare by columns", () => {
      expect(
        extractIndexColumns(
          'CREATE UNIQUE INDEX "x" ON public."T" USING btree ("a") WHERE ("deleted" = false)',
        ),
      ).toBeNull();
    });
  });
});
