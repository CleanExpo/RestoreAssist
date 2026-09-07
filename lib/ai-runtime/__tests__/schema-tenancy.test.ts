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
    for (const f of ["maxMicroUsd", "remainingMicroUsd"]) {
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
    // `new Map` would silently keep the LAST row per table. Review round 2:
    // if a table ever gains a second FK to Workspace (a `sharedWorkspaceId`,
    // say), the discovery would quietly start checking the wrong column — and
    // a wrong column here means a correct policy fails or an incorrect one
    // passes, with nothing on screen to say which. Ambiguity is refused
    // outright instead, because the honest answer is "this test no longer
    // knows which column is the tenant column".
    const byTable = new Map<string, string[]>();
    for (const f of fks) {
      byTable.set(f.table_name, [...(byTable.get(f.table_name) ?? []), f.column_name]);
    }
    const ambiguous = [...byTable.entries()].filter(([, cols]) => cols.length !== 1);
    expect(
      ambiguous.map(([t, cols]) => `${t}: ${cols.join(", ")}`),
      "a table has more than one foreign key to Workspace — this test can no longer tell which column is the tenant column, so it refuses to guess",
    ).toEqual([]);
    const tenantColumn = new Map([...byTable].map(([t, cols]) => [t, cols[0]]));
    // Control on the discovery itself: if the FK lookup found nothing, every
    // assertion below would be checking against `undefined`.
    expect([...tenantColumn.keys()].sort()).toEqual([...RUNTIME_MODELS].sort());

    for (const r of rows) {
      const col = tenantColumn.get(r.tablename)!;
      // Assert the COMPARISON, not the mention. Round 2: asserting only that
      // the qual contains `"Table"."workspaceId"` and is not a literal
      // self-comparison would pass a predicate that mentions the outer column
      // somewhere harmless while the actual join is to a constant, to another
      // table, or to the wrong alias —
      //   wm."workspaceId" = other."workspaceId" AND "AiRunnerFlag"."workspaceId" IS NOT NULL
      // satisfied both of the old assertions and isolates nothing.
      //
      // The predicate that matters is an equality between the WorkspaceMember
      // row's tenant column and THIS table's own, in either order, whatever
      // alias Postgres chose for the subquery. Two capture groups pinned to
      // the same alias on both sides is what makes it a real join rather than
      // two unrelated mentions.
      const outer = `"${r.tablename}"\\."${col}"`;
      const member = `(\\w+)\\."${col}"`;
      const joined = new RegExp(`(?:${member} = ${outer})|(?:${outer} = ${member})`);
      expect(
        r.qual,
        `${r.policyname} never compares "${r.tablename}"."${col}" to a WorkspaceMember row's ${col} — it may mention the column without joining on it`,
      ).toMatch(joined);
      // Still assert the other direction: the join above must not be the outer
      // table (or WorkspaceMember) compared to ITSELF, which is true for every
      // row and isolates nothing.
      expect(
        r.qual,
        `${r.policyname} compares ${col} to itself — the policy is true for every row`,
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
        keySource: "TENANT_BYOK",
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
      keySource: "TENANT_BYOK" as const,
      idempotencyKey: `replay-${Date.now()}`,
    };
    await prisma.aiRunnerReceipt.create({ data: row });
    await expect(prisma.aiRunnerReceipt.create({ data: row })).rejects.toThrow();
  });

  it("the database refuses a second workspace-wide budget for one period", async () => {
    // This replaces a test that asserted the opposite. The first version made
    // `runner` nullable, and Postgres treats NULLs as distinct in a unique
    // index — so @@unique did not constrain workspace-wide rows at all. That
    // was documented and a test asserted the duplicate was ALLOWED, which
    // review round 1 correctly called a rationalisation: the hole was cheap to
    // close. The old test is gone rather than adjusted, because it asserted a
    // property the schema no longer has.
    //
    // Round 2 then attacked the FIX: closing it by adding WORKSPACE to
    // AiRunner made that value legal on every table AiRunner touches. The
    // scope now lives in its own enum, `AiBudgetScope`, so the budget gets its
    // NOT NULL workspace-wide value without a receipt ever being attributable
    // to a runner that does not exist.
    const ws = await seedWorkspace(`ra7493-budget-${Date.now()}`);
    const periodStart = new Date("2026-09-01T00:00:00.000Z");
    const base = {
      workspaceId: ws.id,
      scope: "WORKSPACE" as const,
      periodStart,
      periodEnd: new Date("2026-10-01T00:00:00.000Z"),
      maxMicroUsd: 1_000_000n,
      remainingMicroUsd: 1_000_000n,
    };
    await prisma.aiRunnerBudget.create({ data: base });
    await expect(prisma.aiRunnerBudget.create({ data: base })).rejects.toThrow();
  });

  it("a budget deduction is atomic and refuses at the boundary without a prior read", async () => {
    // The P0 from review round 1. Prisma's updateMany cannot compare two
    // columns, so a `spent <= max - cost` guard needs `max` as an application
    // literal — which means reading the row first, which rule 9 forbids and
    // which races if the ceiling changes. Storing what is LEFT removes the
    // second column from the comparison entirely.
    const ws = await seedWorkspace(`ra7493-atomic-${Date.now()}`);
    const budget = await prisma.aiRunnerBudget.create({
      data: {
        workspaceId: ws.id,
        scope: "JOB_COPILOT",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-10-01T00:00:00.000Z"),
        maxMicroUsd: 100n,
        remainingMicroUsd: 100n,
      },
    });

    const spend = (cost: bigint) =>
      prisma.aiRunnerBudget.updateMany({
        where: { id: budget.id, remainingMicroUsd: { gte: cost } },
        data: { remainingMicroUsd: { decrement: cost } },
      });

    // Exactly at the boundary: allowed, and it empties the budget.
    expect((await spend(100n)).count).toBe(1);
    expect(
      (await prisma.aiRunnerBudget.findUniqueOrThrow({ where: { id: budget.id } }))
        .remainingMicroUsd,
    ).toBe(0n);

    // One micro-dollar past it: refused, and count === 0 is the refusal signal.
    expect((await spend(1n)).count).toBe(0);

    // The control that makes the two above mean something: the same statement
    // on a funded budget still succeeds, so "refused" is not "this never works".
    const funded = await prisma.aiRunnerBudget.create({
      data: {
        workspaceId: ws.id,
        scope: "STYLE",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-10-01T00:00:00.000Z"),
        maxMicroUsd: 100n,
        remainingMicroUsd: 100n,
      },
    });
    const res = await prisma.aiRunnerBudget.updateMany({
      where: { id: funded.id, remainingMicroUsd: { gte: 1n } },
      data: { remainingMicroUsd: { decrement: 1n } },
    });
    expect(res.count).toBe(1);
  });

  it("two concurrent deductions of the whole budget cannot both succeed", async () => {
    const ws = await seedWorkspace(`ra7493-race-${Date.now()}`);
    const b = await prisma.aiRunnerBudget.create({
      data: {
        workspaceId: ws.id,
        scope: "INGESTION",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-10-01T00:00:00.000Z"),
        maxMicroUsd: 50n,
        remainingMicroUsd: 50n,
      },
    });
    const both = await Promise.all([
      prisma.aiRunnerBudget.updateMany({
        where: { id: b.id, remainingMicroUsd: { gte: 50n } },
        data: { remainingMicroUsd: { decrement: 50n } },
      }),
      prisma.aiRunnerBudget.updateMany({
        where: { id: b.id, remainingMicroUsd: { gte: 50n } },
        data: { remainingMicroUsd: { decrement: 50n } },
      }),
    ]);
    expect(both.map((r) => r.count).sort()).toEqual([0, 1]);
    expect(
      (await prisma.aiRunnerBudget.findUniqueOrThrow({ where: { id: b.id } }))
        .remainingMicroUsd,
    ).toBe(0n);
  });

  it("keySource is NOT NULL, so the compliance query cannot be blinded", async () => {
    // Nullable keySource defeated the column's own purpose: a naive
    // `WHERE "keySource" = 'PLATFORM'` silently misses NULL rows, hiding the
    // promise breach. NONE is explicit for a call refused before a provider
    // was chosen.
    const rows = await prisma.$queryRaw<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'AiRunnerReceipt' AND column_name = 'keySource'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe("NO");

    const ws = await seedWorkspace(`ra7493-key-${Date.now()}`);
    await expect(
      prisma.aiRunnerReceipt.create({
        data: {
          workspaceId: ws.id,
          runner: "STYLE",
          taskType: "profile",
          idempotencyKey: `nokey-${Date.now()}`,
          // keySource deliberately omitted
        } as never,
      }),
    ).rejects.toThrow();
  });

  it("AiBudgetScope stays in step with AiRunner", async () => {
    // The cost of giving the budget its own scope enum instead of polluting
    // AiRunner with a WORKSPACE sentinel is drift: a seventh runner added to
    // AiRunner and forgotten here would be silently unbudgetable — no error,
    // just a runner nobody can cap. This is the control that turns that into a
    // failing test instead.
    const values = async (typeName: string) =>
      (
        await prisma.$queryRaw<{ enumlabel: string }[]>`
          SELECT e.enumlabel
          FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = ${typeName}
          ORDER BY e.enumsortorder
        `
      ).map((r) => r.enumlabel);

    const runners = await values("AiRunner");
    const scopes = await values("AiBudgetScope");

    // Positive control: a lookup that found nothing would make the comparison
    // below trivially true.
    expect(runners.length).toBeGreaterThan(0);
    expect(runners).not.toContain("WORKSPACE");
    expect(scopes.slice().sort()).toEqual([...runners, "WORKSPACE"].sort());
  });

  it("a negative cost cannot inflate a budget — the database refuses it", async () => {
    // Review round 2's P0. The spend guard is
    //   where: { remainingMicroUsd: { gte: cost } }, data: { decrement: cost }
    // and `decrement` accepts a NEGATIVE number. A negative cost passes its own
    // guard trivially (remaining >= -50) and then ADDS to the balance: the
    // ceiling raises itself.
    //
    // Two layers, because one is genuinely not enough:
    //   * `remaining >= 0` alone does not catch it — an inflated balance is
    //     still >= 0;
    //   * `remaining <= max` catches an inflation past the ceiling, but NOT a
    //     refund back up to it: -60 against 40 of 100 lands exactly on 100 and
    //     every CHECK passes while the spend is quietly undone.
    // Monotonicity is what actually protects the ceiling, and only a trigger
    // can see the previous value. The attack below is the -60 case — the one
    // the constraints alone would have let through.
    const ws = await seedWorkspace(`ra7493-negcost-${Date.now()}`);
    const b = await prisma.aiRunnerBudget.create({
      data: {
        workspaceId: ws.id,
        scope: "FIELD",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-10-01T00:00:00.000Z"),
        maxMicroUsd: 100n,
        remainingMicroUsd: 40n,
      },
    });

    // The attack: cost = -60. The application guard passes trivially
    // (40 >= -60) and the decrement lands on exactly 100 — inside the ceiling,
    // so no CHECK fires. The monotonic trigger is what refuses it.
    await expect(
      prisma.aiRunnerBudget.updateMany({
        where: { id: b.id, remainingMicroUsd: { gte: -60n } },
        data: { remainingMicroUsd: { decrement: -60n } },
      }),
    ).rejects.toThrow();

    // And the ceiling itself still cannot be exceeded, which is the CHECK
    // rather than the trigger — both layers proved, not just the outer one.
    await expect(
      prisma.aiRunnerBudget.updateMany({
        where: { id: b.id, remainingMicroUsd: { gte: -61n } },
        data: { remainingMicroUsd: { decrement: -61n } },
      }),
    ).rejects.toThrow();

    // And it did not partially apply.
    expect(
      (await prisma.aiRunnerBudget.findUniqueOrThrow({ where: { id: b.id } }))
        .remainingMicroUsd,
    ).toBe(40n);

    // The control: an ordinary deduction on the same row still works, so
    // "refused" above is the constraint firing, not the row being unwritable.
    const ok = await prisma.aiRunnerBudget.updateMany({
      where: { id: b.id, remainingMicroUsd: { gte: 10n } },
      data: { remainingMicroUsd: { decrement: 10n } },
    });
    expect(ok.count).toBe(1);

    // The second control: refilling IS allowed when the window moves, which is
    // what a reset is. Without this, "monotonic" would have made the budget
    // un-resettable and the feature unusable — a guard that blocks the real
    // operation is not a stricter guard, it is a broken one.
    const reset = await prisma.aiRunnerBudget.update({
      where: { id: b.id },
      data: {
        periodStart: new Date("2026-10-01T00:00:00.000Z"),
        periodEnd: new Date("2026-11-01T00:00:00.000Z"),
        remainingMicroUsd: 100n,
      },
    });
    expect(reset.remainingMicroUsd).toBe(100n);
  });

  it("a budget cannot be created already over its own ceiling", async () => {
    const ws = await seedWorkspace(`ra7493-overmax-${Date.now()}`);
    await expect(
      prisma.aiRunnerBudget.create({
        data: {
          workspaceId: ws.id,
          scope: "GOVERNOR",
          periodStart: new Date("2026-09-01T00:00:00.000Z"),
          periodEnd: new Date("2026-10-01T00:00:00.000Z"),
          maxMicroUsd: 100n,
          remainingMicroUsd: 101n,
        },
      }),
    ).rejects.toThrow();
  });

  it("a token ceiling cannot be half-set", async () => {
    // maxTokens set with remainingTokens null would look like a live token
    // ceiling while enforcing nothing.
    const ws = await seedWorkspace(`ra7493-halftoken-${Date.now()}`);
    await expect(
      prisma.aiRunnerBudget.create({
        data: {
          workspaceId: ws.id,
          scope: "SELF_HEAL",
          periodStart: new Date("2026-09-01T00:00:00.000Z"),
          periodEnd: new Date("2026-10-01T00:00:00.000Z"),
          maxMicroUsd: 100n,
          remainingMicroUsd: 100n,
          maxTokens: 5_000n,
          // remainingTokens deliberately omitted
        },
      }),
    ).rejects.toThrow();

    // Control: both set is accepted, so the rejection above is the pairing
    // rule and not "this table refuses token ceilings".
    const okRow = await prisma.aiRunnerBudget.create({
      data: {
        workspaceId: ws.id,
        scope: "STYLE",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-10-01T00:00:00.000Z"),
        maxMicroUsd: 100n,
        remainingMicroUsd: 100n,
        maxTokens: 5_000n,
        remainingTokens: 5_000n,
      },
    });
    expect(okRow.remainingTokens).toBe(5_000n);
  });

  it("a token budget cannot be refilled by routing through NULL", async () => {
    // Review round 3's P0, and the third time in this branch that a fix has
    // reintroduced its own defect one line below the guard. The monotonic
    // trigger compared token balances only when BOTH sides were non-null, so
    // the ceiling could be lifted in two legal steps inside one window: set the
    // pair to NULL (the check skips, NEW is null), then set it back full (the
    // check skips, OLD is null). periodStart never moves; the budget refills.
    const ws = await seedWorkspace(`ra7493-nulltok-${Date.now()}`);
    const b = await prisma.aiRunnerBudget.create({
      data: {
        workspaceId: ws.id,
        scope: "INGESTION",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-10-01T00:00:00.000Z"),
        maxMicroUsd: 100n,
        remainingMicroUsd: 100n,
        maxTokens: 1_000n,
        remainingTokens: 10n,
      },
    });

    // Step one of the attack is now refused on its own: removing the ceiling
    // mid-window grants unlimited tokens.
    await expect(
      prisma.aiRunnerBudget.update({
        where: { id: b.id },
        data: { maxTokens: null, remainingTokens: null },
      }),
    ).rejects.toThrow();

    // And the balance is untouched, so the rejection was the trigger and not a
    // half-applied write.
    expect(
      (await prisma.aiRunnerBudget.findUniqueOrThrow({ where: { id: b.id } })).remainingTokens,
    ).toBe(10n);

    // The control: counting DOWN still works, so the row is not simply frozen.
    const ok = await prisma.aiRunnerBudget.updateMany({
      where: { id: b.id, remainingTokens: { gte: 4n } },
      data: { remainingTokens: { decrement: 4n } },
    });
    expect(ok.count).toBe(1);

    // The mirror image: a budget with NO token ceiling cannot gain one
    // mid-window either, which would grant a balance that was not there.
    const noCeiling = await prisma.aiRunnerBudget.create({
      data: {
        workspaceId: ws.id,
        scope: "GOVERNOR",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-10-01T00:00:00.000Z"),
        maxMicroUsd: 100n,
        remainingMicroUsd: 100n,
      },
    });
    await expect(
      prisma.aiRunnerBudget.update({
        where: { id: noCeiling.id },
        data: { maxTokens: 5_000n, remainingTokens: 5_000n },
      }),
    ).rejects.toThrow();

    // Both are legal when the window moves, because that is a reset.
    const reset = await prisma.aiRunnerBudget.update({
      where: { id: noCeiling.id },
      data: {
        periodStart: new Date("2026-10-01T00:00:00.000Z"),
        periodEnd: new Date("2026-11-01T00:00:00.000Z"),
        maxTokens: 5_000n,
        remainingTokens: 5_000n,
      },
    });
    expect(reset.remainingTokens).toBe(5_000n);
  });

  it("a budget cannot be refilled by nudging periodStart inside the same window", async () => {
    // Review round 4 (P1). "periodStart changed" was taken as proof of a reset,
    // so shifting it by a microsecond and setting remaining back to max minted
    // an unlimited series of refills inside what is, in every sense that
    // matters, the same window. A reset must start at or after the previous
    // window ENDED.
    const ws = await seedWorkspace(`ra7493-nudge-${Date.now()}`);
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-10-01T00:00:00.000Z");
    const b = await prisma.aiRunnerBudget.create({
      data: {
        workspaceId: ws.id,
        scope: "FIELD",
        periodStart: start,
        periodEnd: end,
        maxMicroUsd: 100n,
        remainingMicroUsd: 0n,
      },
    });

    // The attack: nudge the window by a millisecond and refill.
    await expect(
      prisma.aiRunnerBudget.update({
        where: { id: b.id },
        data: { periodStart: new Date(start.getTime() + 1), remainingMicroUsd: 100n },
      }),
    ).rejects.toThrow();

    // Moving it BACKWARD is refused too — otherwise the same trick works in
    // the other direction.
    await expect(
      prisma.aiRunnerBudget.update({
        where: { id: b.id },
        data: { periodStart: new Date(start.getTime() - 86_400_000), remainingMicroUsd: 100n },
      }),
    ).rejects.toThrow();

    expect(
      (await prisma.aiRunnerBudget.findUniqueOrThrow({ where: { id: b.id } })).remainingMicroUsd,
    ).toBe(0n);

    // The control: a genuine new window — starting at or after the old one
    // ended — still resets. Without this the guard would just be "budgets can
    // never be reset", which is a broken feature, not a stricter one.
    const reset = await prisma.aiRunnerBudget.update({
      where: { id: b.id },
      data: {
        periodStart: end,
        periodEnd: new Date("2026-11-01T00:00:00.000Z"),
        remainingMicroUsd: 100n,
      },
    });
    expect(reset.remainingMicroUsd).toBe(100n);
  });

  it("a column added to AiRunnerReceipt later is frozen without touching the trigger", async () => {
    // Review round 4 (P1): the freeze enumerated the FROZEN columns, so any
    // column a later migration added would be absent from the list and
    // therefore silently mutable — the guard would quietly stop covering the
    // newest, least-reviewed field on the table. It now enumerates the
    // PERMITTED columns and compares everything else wholesale.
    //
    // This is the only honest test of that: add a column the trigger has never
    // heard of, and prove it is frozen anyway.
    const ws = await seedWorkspace(`ra7493-failclosed-${Date.now()}`);
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "AiRunnerReceipt" ADD COLUMN "ra7493ProbeColumn" TEXT',
    );
    try {
      const r = await prisma.aiRunnerReceipt.create({
        data: {
          workspaceId: ws.id,
          runner: "STYLE",
          taskType: "probe",
          keySource: "TENANT_BYOK",
          idempotencyKey: `failclosed-${Date.now()}`,
        },
      });

      // Resolving while also writing the unknown column: refused, because the
      // column is not in the permitted set and nothing had to name it to be
      // protected.
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "AiRunnerReceipt" SET "outcome" = 'OK', "ra7493ProbeColumn" = 'mutated' WHERE "id" = $1`,
          r.id,
        ),
      ).rejects.toThrow();

      // The control: the same resolution WITHOUT touching the unknown column
      // still succeeds, so the rejection above is the new column being frozen
      // and not the trigger refusing every update.
      const n = await prisma.$executeRawUnsafe(
        `UPDATE "AiRunnerReceipt" SET "outcome" = 'OK' WHERE "id" = $1`,
        r.id,
      );
      expect(n).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "AiRunnerReceipt" DROP COLUMN IF EXISTS "ra7493ProbeColumn"',
      );
    }
  });

  it("a receipt and a budget cannot be deleted on their own, only with their workspace", async () => {
    // Rounds 3, 4 and 7 all raised this and the first two deferred it. Both
    // BEFORE UPDATE triggers are bypassed entirely by DELETE + re-INSERT: a
    // budget deleted and reinserted is a budget refilled with no UPDATE to see,
    // and a receipt deleted is a runner call that never happened.
    const ws = await seedWorkspace(`ra7493-nodelete-${Date.now()}`);
    const receipt = await prisma.aiRunnerReceipt.create({
      data: {
        workspaceId: ws.id,
        runner: "FIELD",
        taskType: "summarise",
        keySource: "TENANT_BYOK",
        idempotencyKey: `nodel-${Date.now()}`,
      },
    });
    const budget = await prisma.aiRunnerBudget.create({
      data: {
        workspaceId: ws.id,
        scope: "FIELD",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-10-01T00:00:00.000Z"),
        maxMicroUsd: 100n,
        remainingMicroUsd: 0n,
      },
    });

    await expect(
      prisma.aiRunnerReceipt.delete({ where: { id: receipt.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.aiRunnerBudget.delete({ where: { id: budget.id } }),
    ).rejects.toThrow();

    // Both survived — the rejection was the guard, not a half-applied delete.
    expect(await prisma.aiRunnerReceipt.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await prisma.aiRunnerBudget.count({ where: { workspaceId: ws.id } })).toBe(1);

    // The control that makes the guard usable rather than merely strict:
    // deleting the WORKSPACE still takes both rows with it. A guard that blocks
    // tenant deletion would not be stricter, it would be broken.
    await prisma.workspace.delete({ where: { id: ws.id } });
    madeWorkspaces.splice(madeWorkspaces.indexOf(ws.id), 1);
    expect(await prisma.aiRunnerReceipt.count({ where: { workspaceId: ws.id } })).toBe(0);
    expect(await prisma.aiRunnerBudget.count({ where: { workspaceId: ws.id } })).toBe(0);
  });

  it("a receipt resolves exactly once, and its story is frozen at insert", async () => {
    // Round 2 asked for the append-only claim to be enforced rather than
    // asserted. Its suggested fix — revoke UPDATE — would have broken the
    // PENDING → resolved design, which needs exactly one update. The trigger
    // permits that one transition and nothing else.
    const ws = await seedWorkspace(`ra7493-freeze-${Date.now()}`);
    const mk = () =>
      prisma.aiRunnerReceipt.create({
        data: {
          workspaceId: ws.id,
          runner: "FIELD",
          taskType: "summarise",
          keySource: "TENANT_BYOK",
          idempotencyKey: `freeze-${Date.now()}-${Math.random()}`,
        },
      });

    // Permitted: PENDING → terminal, touching only resolution fields.
    const a = await mk();
    const resolved = await prisma.aiRunnerReceipt.update({
      where: { id: a.id },
      data: { outcome: "OK", costMicroUsd: 42n, resolvedAt: new Date(), latencyMs: 120 },
    });
    expect(resolved.outcome).toBe("OK");
    expect(resolved.costMicroUsd).toBe(42n);

    // Refused: a second resolution. A correction is a NEW row via supersedesId.
    await expect(
      prisma.aiRunnerReceipt.update({
        where: { id: a.id },
        data: { outcome: "FAILED" },
      }),
    ).rejects.toThrow();

    // Refused: rewriting the story on a still-PENDING row. keySource is the
    // one that matters most — it is the BYOK promise made queryable, and a
    // receipt that can be edited from PLATFORM to TENANT_BYOK after the fact
    // proves nothing at all.
    const b = await mk();
    await expect(
      prisma.aiRunnerReceipt.update({
        where: { id: b.id },
        data: { outcome: "OK", keySource: "PLATFORM" },
      }),
    ).rejects.toThrow();

    // It did not partially apply: b is still PENDING and still BYOK.
    const after = await prisma.aiRunnerReceipt.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.outcome).toBe("PENDING");
    expect(after.keySource).toBe("TENANT_BYOK");
  });
});
