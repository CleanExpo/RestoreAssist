/**
 * POST /api/admin/seed-demo — schema conformance.
 *
 * WHY THIS SUITE EXISTS
 * ---------------------
 * Every `prisma.*.create({ data })` in this route used to be cast `as any`.
 * The casts silenced `tsc`, and the payloads underneath addressed columns that
 * do not exist on Report, Inspection, Client, MoistureReading or ScopeItem
 * (`moistureContent`, `iicrcReference`, `organizationId`, `affectedAreaM2`, …)
 * while omitting required ones (`hazardType`, `propertyPostcode`,
 * `surfaceType`, `moistureLevel`, `depth`). The route therefore threw a Prisma
 * validation error on its first write and had never seeded anything — but it
 * type-checked, linted and reported no failing test.
 *
 * A mocked `prisma` cannot catch that on its own: a mock accepts any object.
 * So this suite validates the captured payloads against prisma/schema.prisma
 * itself, parsed with the repo's own unit-tested `parseSchemaObjects` (the
 * schema-drift comparator's parser). That is a real oracle rather than a
 * restatement of the code, and it tracks schema changes automatically instead
 * of going stale against a hard-coded field list.
 *
 * Do NOT assume `tsc` makes this suite redundant now that the casts are gone.
 * Both halves were measured against this schema with Prisma 7.9.1:
 *
 *   - OMITTING a required column IS a compile error (verified: dropping
 *     surfaceType/moistureLevel/depth yields TS2322).
 *   - Adding an column that does NOT EXIST is NOT a compile error (verified:
 *     `moistureContent: 99` alongside a complete, valid payload compiles
 *     clean). Prisma's create argument is a generic `SelectSubset<T, …>`, so
 *     T is inferred from the literal itself and excess-property checking has
 *     nothing to flag it against. A bare `{ totallyBogusColumn: 1 }` IS caught,
 *     which is exactly why this is so easy to miss — the trivial case errors
 *     while the realistic one does not.
 *
 * The second bullet is the bug this route actually had, and this suite is the
 * only thing in the repo that catches it. Removing the casts alone would not
 * have.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSchemaObjects } from "@/scripts/check-schema-drift.mjs";

const getServerSession = vi.fn();
const verifyAdminFromDb = vi.fn();

// `vi.mock` factories are hoisted above module-level consts, so the recorder
// and the prisma double must be built inside `vi.hoisted` to exist by the time
// the factory below runs.
const { writes, prismaMock } = vi.hoisted(() => {
  /** Every payload the route wrote, in order: [modelName, data]. */
  const writes: Array<[string, Record<string, unknown>]> = [];

  const recordingModel = (name: string, result: Record<string, unknown>) => ({
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      writes.push([name, data]);
      return { ...result, ...data };
    }),
    findUnique: vi.fn(async () => null as Record<string, unknown> | null),
    findFirst: vi.fn(async () => null as Record<string, unknown> | null),
    update: vi.fn(async () => result),
  });

  return {
    writes,
    prismaMock: {
      user: recordingModel("User", { id: "admin_1" }),
      organization: recordingModel("Organization", { id: "org_demo" }),
      client: recordingModel("Client", { id: "client_demo" }),
      report: recordingModel("Report", { id: "report_demo" }),
      inspection: recordingModel("Inspection", { id: "insp_demo" }),
      moistureReading: recordingModel("MoistureReading", { id: "mr_demo" }),
      scopeItem: recordingModel("ScopeItem", { id: "si_demo" }),
      // The route builds arrays of already-invoked creates and hands them over.
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    },
  };
});

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...args: unknown[]) => verifyAdminFromDb(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "../route";

// ── Schema oracle ────────────────────────────────────────────────────────────

const { columns: SCHEMA_COLUMNS } = parseSchemaObjects(
  readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8"),
) as { columns: Map<string, Set<string>> };

function fieldNames(model: string): Set<string> {
  const cols = SCHEMA_COLUMNS.get(model);
  if (!cols) throw new Error(`Model ${model} is not in prisma/schema.prisma`);
  return cols;
}

function post() {
  return new NextRequest("http://localhost/api/admin/seed-demo", {
    method: "POST",
  });
}

beforeEach(() => {
  writes.length = 0;
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "admin_1" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin_1", role: "ADMIN", organizationId: null },
  });
  prismaMock.inspection.findUnique.mockResolvedValue(null); // not yet seeded
  prismaMock.user.findUnique.mockResolvedValue(null);
  prismaMock.organization.findFirst.mockResolvedValue(null);
});

describe("POST /api/admin/seed-demo", () => {
  it("seeds the demo claim end to end", async () => {
    const response = await POST(post());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.seeded).toBe(true);
    expect(body.inspectionId).toBe("insp_demo");
  });

  it("proves the write recorder actually captured writes", async () => {
    // Positive control. Every assertion below is of the form "no payload
    // violates X" — vacuously true if nothing was recorded.
    await POST(post());
    expect(writes.length).toBeGreaterThan(20);
    expect(new Set(writes.map(([m]) => m))).toEqual(
      new Set([
        "Client",
        "Report",
        "Inspection",
        "MoistureReading",
        "ScopeItem",
      ]),
    );
  });

  it("seeds the claim onto the calling admin, not a separate persona", async () => {
    await POST(post());

    // Every write route the demo walks through scopes by the session user, so
    // a claim owned by anyone else is read-only for the operator running it.
    for (const model of ["Client", "Report", "Inspection"]) {
      const data = writes.find(([m]) => m === model)?.[1];
      expect(data?.userId).toBe("admin_1");
    }

    // It must not create a privileged user or touch the caller's organisation.
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.organization.create).not.toHaveBeenCalled();
  });

  it("writes only columns that exist on each model", async () => {
    await POST(post());

    const offenders: string[] = [];
    for (const [model, data] of writes) {
      const allowed = fieldNames(model);
      for (const key of Object.keys(data)) {
        if (!allowed.has(key)) offenders.push(`${model}.${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("catches a bad column — the check can fail", () => {
    // Negative control for the suite above. Without this, a fieldNames() that
    // returned "everything" (or a parser that silently produced empty sets)
    // would make "writes only columns that exist" pass on absolutely anything.
    // Each assertion names a column the ORIGINAL route actually wrote.
    const moisture = fieldNames("MoistureReading");
    expect(moisture.size).toBeGreaterThan(10);
    expect(moisture.has("moistureLevel")).toBe(true);
    expect(moisture.has("moistureContent")).toBe(false);
    expect(moisture.has("readingDate")).toBe(false);

    const scope = fieldNames("ScopeItem");
    expect(scope.has("clauseRef")).toBe(true);
    expect(scope.has("iicrcReference")).toBe(false);
    expect(scope.has("reportId")).toBe(false);

    expect(fieldNames("Inspection").has("affectedAreaM2")).toBe(false);
    expect(fieldNames("Report").has("isS500Compliant")).toBe(false);

    // And the same predicate run over the original payload must flag it.
    const original = {
      inspectionId: "i",
      location: "l",
      material: "Plasterboard",
      moistureContent: 28,
      readingType: "STRUCTURAL",
      readingDate: new Date(),
    };
    const offenders = Object.keys(original).filter((k) => !moisture.has(k));
    expect(offenders.sort()).toEqual([
      "material",
      "moistureContent",
      "readingDate",
      "readingType",
    ]);
  });
});

describe("the seeded demo claim", () => {
  it("lays down a drying log that reaches the S500 dry standard", async () => {
    await POST(post());
    const readings = writes
      .filter(([m]) => m === "MoistureReading")
      .map(([, d]) => d);

    expect(readings).toHaveLength(21);

    // The monitoring report keys IICRC_TARGETS on the lowercase surfaceType.
    // Anything else silently falls back to the generic 15% target.
    const TARGETS: Record<string, number> = {
      timber: 19,
      plasterboard: 1.5,
      concrete: 3.5,
    };
    const byPoint = new Map<string, number[]>();
    for (const r of readings) {
      const surface = String(r.surfaceType);
      expect(Object.keys(TARGETS)).toContain(surface);
      byPoint.set(surface, [
        ...(byPoint.get(surface) ?? []),
        Number(r.moistureLevel),
      ]);
    }

    expect(byPoint.size).toBe(3);
    for (const [surface, curve] of byPoint) {
      expect(curve).toHaveLength(7);
      // Monotonically drying, and finishing at or under the S500 target.
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i]).toBeLessThan(curve[i - 1]);
      }
      expect(curve[curve.length - 1]).toBeLessThanOrEqual(TARGETS[surface]);
      expect(curve[0]).toBeGreaterThan(TARGETS[surface]);
    }

    // Readings must be spread over the 3-day programme, not all stamped now.
    const stamps = new Set(
      readings.map((r) => (r.recordedAt as Date).toISOString()),
    );
    expect(stamps.size).toBe(3);
  });

  it("marks the inspection as a WATER claim so the moisture UI is reachable", async () => {
    await POST(post());
    const inspection = writes.find(([m]) => m === "Inspection")?.[1];

    // app/dashboard/inspections/[id] renders the Moisture and Moisture Map tabs
    // only when moistureReadingsRequired(claimType) is true, i.e. claimType is
    // exactly "WATER". Seeded without it, the drying log and the meter-photo
    // capture card cannot be reached from the UI at all.
    expect(inspection?.claimType).toBe("WATER");
  });

  it("cites S500 clauses on the scope in the field the report reads", async () => {
    await POST(post());
    const items = writes.filter(([m]) => m === "ScopeItem").map(([, d]) => d);

    expect(items).toHaveLength(5);
    const cited = items.filter((i) => typeof i.clauseRef === "string");
    expect(cited.length).toBeGreaterThanOrEqual(4);
    for (const item of cited) {
      expect(String(item.clauseRef)).toMatch(/^IICRC S500:2021 §\d/);
    }
  });

  it("is idempotent once the demo inspection exists", async () => {
    prismaMock.inspection.findUnique.mockResolvedValue({ id: "insp_existing" });

    const response = await POST(post());
    const body = await response.json();

    expect(body.seeded).toBe(false);
    expect(body.inspectionId).toBe("insp_existing");
    expect(writes).toEqual([]);
  });

  it("refuses a non-admin caller before writing anything", async () => {
    verifyAdminFromDb.mockResolvedValue({
      response: new Response("forbidden", { status: 403 }),
    });

    const response = await POST(post());

    expect(response.status).toBe(403);
    expect(writes).toEqual([]);
  });
});
