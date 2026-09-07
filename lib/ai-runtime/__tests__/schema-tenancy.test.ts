/**
 * RA-7493 — the AI runtime's tables are tenant-scoped, and that is asserted
 * rather than read off the schema.
 *
 * Why a test and not a review: "every model has workspaceId" is exactly the
 * kind of claim that stays true right up until someone adds the sixth model in
 * a hurry. PR #2178 was a customer's ADMIN role reaching another customer's
 * records. A structural assertion is cheap; the incident is not.
 *
 * TWO LAYERS, AND THE SPLIT IS DELIBERATE — it follows what each instrument can
 * actually see.
 *
 *   1. The generated client's DMMF. In Prisma 7 the RUNTIME dmmf is minimal:
 *      every field carries `name`, `kind` and `type`, and nothing else. There is
 *      no `isRequired`, no `hasDefaultValue`, no `relationOnDelete`, and no
 *      uniqueIndexes/index array. (Measured, not assumed — an earlier draft of
 *      this file asserted all four and 16 of 21 cases failed against undefined.)
 *      So this layer proves the models and their Workspace relation exist and
 *      that money is an integer type. It cannot prove a cascade or a default.
 *
 *   2. Postgres itself, via information_schema and pg_catalog. Cascade
 *      behaviour, column defaults and indexes are properties of the DATABASE,
 *      so the database is what gets asked. This also means the grader is not
 *      the thing being graded: the schema file could claim anything, and these
 *      assertions would still fail if the migration did not deliver it.
 *      Gated on DATABASE_URL, so it runs under `npm run test:db` and in CI.
 *
 * Layer 1 alone would be a weak schema linter. Layer 2 alone would skip
 * silently on a machine with no Docker. Neither is sufficient on its own.
 */
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Prisma } from "@prisma/client";

/** Every model this branch introduced. Adding a sixth without listing it here
 *  is the failure mode, so the list is checked against the DMMF below — a new
 *  Ai* model that nobody listed fails the suite instead of slipping past. */
const RUNTIME_MODELS = [
  "AiRunnerFlag",
  "AiRunnerBudget",
  "AiRunnerReceipt",
  "AiJobSuggestion",
  "AiStyleProfile",
] as const;

type MinimalField = { name: string; kind: string; type: string; relationName?: string };
type MinimalModel = { name: string; fields: MinimalField[] };

function model(name: string): MinimalModel {
  const m = (Prisma.dmmf.datamodel.models as unknown as MinimalModel[]).find(
    (x) => x.name === name,
  );
  if (!m) throw new Error(`model ${name} is not in the generated client`);
  return m;
}

describe("RA-7493 AI-runtime models exist and point at a workspace", () => {
  it("the list under test is the complete set of new Ai* models", () => {
    // Positive control on this file's own scope. A green below means "all of
    // them", not "all of the ones I remembered".
    const discovered = (Prisma.dmmf.datamodel.models as unknown as MinimalModel[])
      .map((m) => m.name)
      .filter((n) => /^Ai(Runner|Job|Style)/.test(n))
      .sort();
    expect(discovered).toEqual([...RUNTIME_MODELS].sort());
  });

  it.each(RUNTIME_MODELS)("%s carries a workspaceId scalar", (name) => {
    const f = model(name).fields.find((x) => x.name === "workspaceId");
    expect(f, `${name} has no workspaceId`).toBeDefined();
    expect(f!.kind).toBe("scalar");
    expect(f!.type).toBe("String");
  });

  it.each(RUNTIME_MODELS)("%s has a Workspace relation", (name) => {
    const rel = model(name).fields.find(
      (x) => x.kind === "object" && x.type === "Workspace",
    );
    expect(rel, `${name} has no Workspace relation`).toBeDefined();
  });

  it("money is an integer type, never Float", () => {
    // A ceiling that must refuse exactly at a boundary cannot be built on
    // binary floating point. AiUsageLog.estimatedCostUsd is a Float, which is
    // right for a telemetry estimate and would be wrong here.
    const budget = model("AiRunnerBudget");
    for (const f of ["maxMicroUsd", "spentMicroUsd"]) {
      expect(budget.fields.find((x) => x.name === f)?.type, f).toBe("BigInt");
    }
    expect(
      model("AiRunnerReceipt").fields.find((x) => x.name === "costMicroUsd")?.type,
    ).toBe("BigInt");
  });
});

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)("RA-7493 tenancy holds in the database, not just the model", () => {
  // Loaded in a hook, not at module scope: `describe.skipIf` still evaluates
  // the callback body during collection, and @/lib/prisma opens a pg Pool from
  // DATABASE_URL the moment it is imported. A top-level import would blow up
  // the whole file on a machine with no database — turning a skip into a
  // suite failure, which is the worse of the two.
  let prisma: (typeof import("@/lib/prisma"))["prisma"];
  const madeWorkspaces: string[] = [];
  const madeUsers: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
  });

  afterAll(async () => {
    if (madeWorkspaces.length) {
      await prisma.workspace.deleteMany({ where: { id: { in: madeWorkspaces } } });
    }
    if (madeUsers.length) {
      await prisma.user.deleteMany({ where: { id: { in: madeUsers } } });
    }
  });

  async function seedWorkspace(slug: string) {
    const owner = await prisma.user.create({
      data: { email: `${slug}@ra7493.test`, name: "RA-7493 fixture" },
    });
    madeUsers.push(owner.id);
    const ws = await prisma.workspace.create({
      data: { name: `RA-7493 ${slug}`, slug, ownerId: owner.id },
    });
    madeWorkspaces.push(ws.id);
    return ws;
  }

  it("every AI-runtime table's workspace foreign key is ON DELETE CASCADE", async () => {
    const rows = await prisma.$queryRaw<{ table_name: string; delete_rule: string }[]>`
      SELECT tc.table_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'workspaceId'
        AND tc.table_name IN ('AiRunnerFlag','AiRunnerBudget','AiRunnerReceipt','AiJobSuggestion','AiStyleProfile')
    `;
    // Control: the query must find all five, or a "no CASCADE violations"
    // result would just mean it matched nothing.
    expect(rows.map((r) => r.table_name).sort()).toEqual([...RUNTIME_MODELS].sort());
    expect(rows.filter((r) => r.delete_rule !== "CASCADE")).toEqual([]);
  });

  it("every AI-runtime table has RLS enabled", async () => {
    const rows = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('AiRunnerFlag','AiRunnerBudget','AiRunnerReceipt','AiJobSuggestion','AiStyleProfile')
    `;
    expect(rows.map((r) => r.relname).sort()).toEqual([...RUNTIME_MODELS].sort());
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it("each SELECT policy actually compares WorkspaceMember to ITS OWN table's workspaceId", async () => {
    // The bug this catches is not hypothetical and it is invisible to review.
    // An unqualified "workspaceId" inside the policy subquery binds to
    // WorkspaceMember's own column, so the predicate becomes
    // wm."workspaceId" = wm."workspaceId" — always true, for every row, for any
    // member of any workspace. It reads exactly like tenant isolation.
    //
    // Postgres stores the RESOLVED predicate, so pg_policies.qual shows which
    // binding actually happened. Asserting on the stored qual is the only way
    // to tell the two apart; the migration text cannot.
    //
    // Measured, not assumed. The same predicate written both ways stores as:
    //   qualified:   (wm."workspaceId" = "AiRunnerFlag"."workspaceId")
    //   unqualified: (wm."workspaceId" = wm."workspaceId")        ← tautology
    // The table name comes back QUOTED, which is why the expected substring
    // below is quoted too — an earlier draft looked for an unquoted name and
    // failed against a policy that was perfectly correct.
    const rows = await prisma.$queryRaw<{ tablename: string; policyname: string; qual: string }[]>`
      SELECT tablename, policyname, qual FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('AiRunnerFlag','AiRunnerBudget','AiRunnerReceipt','AiJobSuggestion','AiStyleProfile')
    `;
    // Control: all five policies must be found, or "no bad predicates" would
    // just mean the query matched nothing.
    expect(rows.map((r) => r.tablename).sort()).toEqual([...RUNTIME_MODELS].sort());

    // The tenant column is DISCOVERED from the foreign key, not hardcoded.
    // Hardcoding "workspaceId" makes this test fail noisily on a rename that
    // Postgres handles correctly: the stored expression tree is rewritten to
    // the new name, the policy stays valid, and only the assertion breaks.
    // Asking the database which column actually points at Workspace keeps the
    // check aimed at the property (is the outer table's own tenant column on
    // the right-hand side) rather than at a spelling.
    const fks = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'Workspace'
        AND tc.table_name IN ('AiRunnerFlag','AiRunnerBudget','AiRunnerReceipt','AiJobSuggestion','AiStyleProfile')
    `;
    const tenantColumn = new Map(fks.map((f) => [f.table_name, f.column_name]));
    // Control on the discovery itself: if the FK lookup found nothing, every
    // assertion below would be checking against `undefined`.
    expect([...tenantColumn.keys()].sort()).toEqual([...RUNTIME_MODELS].sort());

    for (const r of rows) {
      const col = tenantColumn.get(r.tablename)!;
      expect(
        r.qual,
        `${r.policyname} does not reference "${r.tablename}"."${col}" — the outer table's own tenant column`,
      ).toContain(`"${r.tablename}"."${col}"`);
      // The other direction, because the first assertion alone would pass a
      // predicate that mentioned the outer table somewhere else while still
      // carrying the tautology.
      expect(
        r.qual,
        `${r.policyname} compares WorkspaceMember's ${col} to itself — the policy is true for every row`,
      ).not.toMatch(new RegExp(`(\\w+)\\."${col}" = \\1\\."${col}"`));
    }
  });

  it("AiRunnerFlag.enabled defaults to false in the database", async () => {
    const rows = await prisma.$queryRaw<{ column_default: string | null }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'AiRunnerFlag' AND column_name = 'enabled'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].column_default).toBe("false");
  });

  it("deleting a workspace takes its AI-runtime rows with it", async () => {
    const ws = await seedWorkspace(`ra7493-cascade-${Date.now()}`);

    await prisma.aiRunnerFlag.create({
      data: { workspaceId: ws.id, runner: "JOB_COPILOT", enabled: true },
    });
    await prisma.aiRunnerReceipt.create({
      data: {
        workspaceId: ws.id,
        runner: "JOB_COPILOT",
        taskType: "suggest",
        idempotencyKey: `k-${Date.now()}`,
      },
    });
    await prisma.aiStyleProfile.create({
      data: { workspaceId: ws.id, profile: {} },
    });

    // Control: the rows are really there, so a zero after the delete means
    // "cascaded" and not "the query never matched anything".
    expect(await prisma.aiRunnerFlag.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await prisma.aiRunnerReceipt.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await prisma.aiStyleProfile.count({ where: { workspaceId: ws.id } })).toBe(1);

    await prisma.workspace.delete({ where: { id: ws.id } });
    madeWorkspaces.splice(madeWorkspaces.indexOf(ws.id), 1);

    expect(await prisma.aiRunnerFlag.count({ where: { workspaceId: ws.id } })).toBe(0);
    expect(await prisma.aiRunnerReceipt.count({ where: { workspaceId: ws.id } })).toBe(0);
    expect(await prisma.aiStyleProfile.count({ where: { workspaceId: ws.id } })).toBe(0);
  });

  it("a replayed receipt is refused by the idempotency constraint, not billed twice", async () => {
    const ws = await seedWorkspace(`ra7493-idem-${Date.now()}`);
    const row = {
      workspaceId: ws.id,
      runner: "INGESTION" as const,
      taskType: "normalise",
      idempotencyKey: `replay-${Date.now()}`,
    };
    await prisma.aiRunnerReceipt.create({ data: row });
    await expect(prisma.aiRunnerReceipt.create({ data: row })).rejects.toThrow();
  });

  it("DOCUMENTED HAZARD: two workspace-wide budgets for one period are NOT refused by the database", async () => {
    // Postgres treats NULLs as distinct in a unique index, so
    // @@unique([workspaceId, runner, periodStart]) does not constrain rows
    // where runner IS NULL. This test makes that concrete rather than leaving
    // it as a comment nobody reads: writers of workspace-wide budgets must
    // upsert on a deterministic id. If a later change makes the database refuse
    // this — a partial unique index, or NULLS NOT DISTINCT — this test fails,
    // and the correct response is to delete it and drop the upsert rule.
    const ws = await seedWorkspace(`ra7493-budget-${Date.now()}`);
    const periodStart = new Date("2026-09-01T00:00:00.000Z");
    const base = {
      workspaceId: ws.id,
      runner: null,
      periodStart,
      periodEnd: new Date("2026-10-01T00:00:00.000Z"),
      maxMicroUsd: 1_000_000n,
    };
    await prisma.aiRunnerBudget.create({ data: base });
    await prisma.aiRunnerBudget.create({ data: base });
    expect(
      await prisma.aiRunnerBudget.count({
        where: { workspaceId: ws.id, runner: null, periodStart },
      }),
    ).toBe(2);
  });
});
