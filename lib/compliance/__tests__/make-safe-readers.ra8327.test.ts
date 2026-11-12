/**
 * RA-8327 — every reader that judges make-safe completion goes through the
 * list owner (lib/compliance/make-safe-list.ts), so a row kept from the job's
 * other list (history) never blocks, and a missing row on the job's current
 * list always counts as open.
 *
 * SWMS is the documented exception: it reads rows to add hazards, and a
 * history row can only add a hazard, which is the safe direction.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { inspectionFindUnique } = vi.hoisted(() => ({
  inspectionFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { inspection: { findUnique: (...a: unknown[]) => inspectionFindUnique(...a) } },
}));

import { attestStabilisationGuard } from "@/lib/progress/guards/stabilisation";
import type { GuardContext } from "@/lib/progress/guards/types";
import { generateSwmsDraft } from "@/lib/swms/auto-generator";

const FIRE = [
  "power_isolated",
  "gas_isolated",
  "structure_safe",
  "openings_secured",
  "occupant_briefing",
  "asbestos_presumed",
];
const STANDARD = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
];
const OLD = new Date("2026-10-01T00:00:00.000Z");

type Row = {
  id?: string;
  action: string;
  applicable: boolean;
  completed: boolean;
  notes?: string | null;
  createdAt?: Date;
};
const done = (action: string, extra: Partial<Row> = {}): Row => ({
  id: `ms_${action}`,
  action,
  applicable: true,
  completed: true,
  notes: null,
  ...extra,
});

function ctx(): GuardContext {
  return {
    claimProgressId: "cp_1",
    reportId: "r_1",
    inspectionId: "i_1",
    fromState: "STABILISATION_ACTIVE",
    toState: "STABILISATION_COMPLETE",
    key: "attest_stabilisation",
  };
}

function guardDb(opts: { claimType: string | null; rows: Row[]; fireAssessment?: boolean }) {
  return {
    inspection: { findUnique: async () => ({ claimType: opts.claimType }) },
    fireSmokeDamageAssessment: {
      findFirst: async () => (opts.fireAssessment ? { id: "fsa_1" } : null),
    },
    makeSafeAction: { findMany: async () => opts.rows },
    swmsDraft: { findFirst: async () => ({ id: "s_1", signedAt: new Date() }) },
    wHSIncident: { findMany: async () => [] },
    inspectionPhoto: { count: async () => 1 },
  };
}

const attest = (db: ReturnType<typeof guardDb>) =>
  attestStabilisationGuard(db as never, ctx());

describe("stabilisation attestation reads the job's list through the owner", () => {
  it("passes a fire job with all six fire items complete, an old open mould_containment row and a signed SWMS (Codex round 4)", async () => {
    const res = await attest(
      guardDb({
        claimType: "FIRE",
        rows: [
          ...FIRE.map((a) => done(a)),
          done("mould_containment", { completed: false, createdAt: OLD }),
        ],
      }),
    );
    expect(res.passed).toBe(true);
  });

  it("blocks a fire job on its missing fire rows even when the old standard list is complete", async () => {
    const res = await attest(
      guardDb({ claimType: "FIRE", rows: STANDARD.map((a) => done(a, { createdAt: OLD })) }),
    );
    expect(res.passed).toBe(false);
    for (const a of ["structure_safe", "openings_secured", "asbestos_presumed"]) {
      expect(res.reason).toContain(a);
    }
    expect(res.reason).not.toContain("mould_containment");
  });

  it("a water job's open fire row is history and never blocks; its own open row does", async () => {
    const history = done("structure_safe", { completed: false });
    expect(
      (await attest(guardDb({ claimType: "WATER", rows: [...STANDARD.map((a) => done(a)), history] }))).passed,
    ).toBe(true);
    const res = await attest(
      guardDb({
        claimType: "WATER",
        rows: [...STANDARD.map((a) => done(a, { completed: a !== "water_stopped" })), history],
      }),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("water_stopped");
    expect(res.reason).not.toContain("structure_safe");
  });

  it("counts a missing row on the job's list as open, the same as the submit gate", async () => {
    const res = await attest(
      guardDb({ claimType: "WATER", rows: [done("power_isolated"), done("water_stopped")] }),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("gas_isolated");
  });

  it("a blank claim type with a fire assessment is judged on the fire list", async () => {
    const res = await attest(
      guardDb({ claimType: null, fireAssessment: true, rows: STANDARD.map((a) => done(a)) }),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("structure_safe");
  });
});

describe("SWMS keeps reading every row: history can only add hazards", () => {
  beforeEach(() => inspectionFindUnique.mockReset());

  it("a fire job's old applicable mould_containment row still adds the mould hazard", async () => {
    inspectionFindUnique.mockResolvedValue({
      id: "insp-1",
      propertyPostcode: "4000",
      propertyCountry: "AU",
      propertyYearBuilt: 2010,
      makeSafeActions: [
        ...FIRE.map((a) => done(a)),
        done("mould_containment", { completed: false }),
      ],
      affectedAreas: [{ category: "1", affectedSquareFootage: 50 }],
      whsIncidents: [],
    });
    const draft = await generateSwmsDraft("insp-1");
    expect(JSON.stringify(draft.hazards)).toMatch(/mould/i);
  });
});

// ── Structural: only the owner modules query make-safe rows ─────────────────

const ROOT = process.cwd();
const OWNERS = new Set([
  "lib/compliance/make-safe-list.ts",
  "lib/compliance/make-safe-gate.ts",
  "lib/compliance/seed-make-safe.ts",
  "app/api/inspections/[id]/make-safe/route.ts",
  // Not a completion judgement: reads rows to add hazards (see the test above).
  "lib/swms/auto-generator.ts",
]);
/** A read of make-safe rows: a model query, or a relation select/include. */
const READ = [
  /\bmakeSafeAction\s*\.\s*(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|aggregate|groupBy)\b/,
  /\bmakeSafeActions\s*:\s*(\{|true)/,
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("only the owner modules read make-safe rows to judge completion", () => {
  it("the read pattern recognises a planted query and a planted relation select", () => {
    const planted = [
      "await prisma.makeSafeAction.findMany({ where })",
      "await db.makeSafeAction\n  .count()",
      "select: { makeSafeActions: { select: { action: true } } }",
      "include: { makeSafeActions: true }",
    ];
    for (const text of planted) expect(READ.some((re) => re.test(text))).toBe(true);
    expect(READ.some((re) => re.test("tx.makeSafeAction.upsert({})"))).toBe(false);
  });

  it("no other module in app/, lib/ or components/ reads them", () => {
    const readers = ["app", "lib", "components"]
      .flatMap((d) => sourceFiles(join(ROOT, d)))
      .filter((f) => READ.some((re) => re.test(readFileSync(f, "utf8"))))
      .map((f) => relative(ROOT, f).split("\\").join("/"));
    // Positive control: the scan reaches the owners it allows.
    expect(readers).toContain("lib/compliance/make-safe-list.ts");
    expect(readers.filter((f) => !OWNERS.has(f))).toEqual([]);
  });
});
