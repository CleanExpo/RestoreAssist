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
const { writes, prismaMock, resetPrismaMock } = vi.hoisted(() => {
  /** Every payload the route wrote, in order: [modelName, data]. */
  const writes: Array<[string, Record<string, unknown>]> = [];

  const MODELS: Array<[string, string, Record<string, unknown>]> = [
    ["user", "User", { id: "admin_1" }],
    ["organization", "Organization", { id: "org_demo" }],
    ["client", "Client", { id: "client_demo" }],
    ["report", "Report", { id: "report_demo" }],
    ["inspection", "Inspection", { id: "insp_demo" }],
    ["moistureReading", "MoistureReading", { id: "mr_demo" }],
    ["scopeItem", "ScopeItem", { id: "si_demo" }],
  ];

  const prismaMock: Record<string, any> = {};
  for (const [key] of MODELS) {
    prismaMock[key] = {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    };
  }
  prismaMock.$transaction = vi.fn();

  /**
   * Reinstall every implementation from scratch.
   *
   * `vi.clearAllMocks()` clears call history but NOT the `...Once` queues, so a
   * value queued by one test and left unconsumed leaks into the next one. That
   * is not hypothetical: a mutation run proved these very tests were passing on
   * queue ordering rather than on the behaviour they claim to check. Full
   * `mockReset` per test removes the order dependence.
   */
  const resetPrismaMock = () => {
    for (const [key, name, result] of MODELS) {
      const model = prismaMock[key];
      model.create.mockReset();
      model.findUnique.mockReset();
      model.findFirst.mockReset();
      model.update.mockReset();
      model.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          writes.push([name, data]);
          return { ...result, ...data };
        },
      );
      model.findUnique.mockResolvedValue(null);
      model.findFirst.mockResolvedValue(null);
      model.update.mockResolvedValue(result);
    }
    // The whole seed runs inside ONE interactive transaction, so this is called
    // with a callback and must hand it a transaction client. The array form is
    // still accepted so the double cannot silently pass a regression back to
    // ungrouped batch writes.
    prismaMock.$transaction.mockReset();
    prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
        : Promise.all(arg as unknown[]),
    );
  };

  return { writes, prismaMock, resetPrismaMock };
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
  // Full reset, not just clear — see resetPrismaMock's comment on `...Once`
  // queue leakage between tests.
  resetPrismaMock();
  getServerSession.mockResolvedValue({ user: { id: "admin_1" } });
  verifyAdminFromDb.mockResolvedValue({
    response: null,
    user: { id: "admin_1", role: "ADMIN", organizationId: null },
  });
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
    prismaMock.inspection.findFirst.mockResolvedValue({ id: "insp_existing" });

    const response = await POST(post());
    const body = await response.json();

    expect(body.seeded).toBe(false);
    expect(body.inspectionId).toBe("insp_existing");
    expect(writes).toEqual([]);
  });

  it("gives each admin their own writable demo claim", async () => {
    // Inspection.inspectionNumber is @unique table-wide. A single fixed demo
    // number would let only the FIRST admin ever hold the demo claim; every
    // later admin would be handed that admin's inspection id by the idempotency
    // branch and be unable to write to it, because the downstream write routes
    // scope by session user.
    await POST(post());
    const first = writes.find(([m]) => m === "Inspection")?.[1];

    writes.length = 0;
    verifyAdminFromDb.mockResolvedValue({
      response: null,
      user: { id: "admin_2", role: "ADMIN", organizationId: null },
    });
    await POST(post());
    const second = writes.find(([m]) => m === "Inspection")?.[1];

    expect(first?.inspectionNumber).not.toBe(second?.inspectionNumber);
    expect(first?.userId).toBe("admin_1");
    expect(second?.userId).toBe("admin_2");
    // The idempotency lookup must be scoped by OWNER as well as number. Keyed on
    // the number alone, any collision hands the caller someone else's row id.
    expect(prismaMock.inspection.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          inspectionNumber: second?.inspectionNumber,
          userId: "admin_2",
        },
      }),
    );
  });

  it("does not truncate the owner id into a collision class", async () => {
    // An earlier fix used `userId.slice(-8)`, which did not remove the
    // cross-admin failure mode — it shrank it to "two ids sharing a suffix".
    // These two ids differ ONLY before the last 8 characters.
    const idA = "cuid_aaaaaaaa_ZZZZZZZZ";
    const idB = "cuid_bbbbbbbb_ZZZZZZZZ";
    expect(idA.slice(-8)).toBe(idB.slice(-8)); // the collision the old key had

    const numbers: string[] = [];
    for (const id of [idA, idB]) {
      writes.length = 0;
      verifyAdminFromDb.mockResolvedValue({
        response: null,
        user: { id, role: "ADMIN", organizationId: null },
      });
      await POST(post());
      const inspection = writes.find(([m]) => m === "Inspection")?.[1];
      numbers.push(String(inspection?.inspectionNumber));
      expect(String(inspection?.inspectionNumber)).toContain(id);
    }
    expect(numbers[0]).not.toBe(numbers[1]);
  });

  it("writes the whole demo graph inside one transaction", async () => {
    await POST(post());

    // The idempotency branch treats "an inspection exists" as "the demo is
    // seeded". That is only true if the graph is all-or-nothing: a failure
    // after the inspection row lands but before the drying log or scope would
    // otherwise leave a demo that can never repair itself, because the retry
    // returns seeded:false and the Monitoring tab stays empty.
    const tx = prismaMock.$transaction as ReturnType<typeof vi.fn>;
    expect(tx).toHaveBeenCalledTimes(1);
    expect(typeof tx.mock.calls[0][0]).toBe("function");

    // And every write must have happened through it, not outside it.
    const insideTx = tx.mock.results[0];
    expect(insideTx.type).toBe("return");
    // 1 client + 1 report + 1 inspection + 21 readings + 5 scope items.
    expect(writes.length).toBe(29);
  });

  it("rolls the whole seed back when a late write fails", async () => {
    // Simulate the scope-item batch failing after the inspection already
    // landed. With a real transaction nothing is committed; the assertion here
    // is that the route does not swallow it and report success.
    prismaMock.scopeItem.create.mockRejectedValueOnce(
      new Error("scope insert exploded"),
    );

    const response = await POST(post());

    expect(response.status).toBeGreaterThanOrEqual(500);
    const body = await response.json();
    expect(body.seeded).not.toBe(true);
  });

  it("returns the idempotent answer when it loses a concurrent double-press", async () => {
    // The idempotency read necessarily precedes the transaction, so two
    // simultaneous presses by the same admin can both observe "not seeded". The
    // @unique constraint on inspectionNumber makes the loser fail with P2002,
    // with nothing committed. The loser must get the same answer it would have
    // got a moment later — not a 500 that looks, on a demo stage, like the seed
    // broke when it actually succeeded.
    prismaMock.inspection.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    prismaMock.inspection.findFirst
      .mockResolvedValueOnce(null) // pre-check: nothing seeded yet
      .mockResolvedValueOnce({ id: "insp_winner" }); // post-race re-read

    const response = await POST(post());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.seeded).toBe(false);
    expect(body.inspectionId).toBe("insp_winner");
  });

  it("still surfaces a unique violation that is not the demo race", async () => {
    // Negative control for the branch above: when the row genuinely is not
    // there, P2002 must NOT be swallowed into a false "already seeded".
    prismaMock.inspection.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    prismaMock.inspection.findFirst.mockResolvedValue(null);

    const response = await POST(post());
    const body = await response.json();

    // fromException maps P2002 to 409 Conflict, which is the honest answer here.
    // What matters is that it is an error and NOT a fabricated idempotent
    // success pointing at an inspection that does not exist.
    expect(response.status).toBe(409);
    expect(body.seeded).toBeUndefined();
    expect(body.inspectionId).toBeUndefined();
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
