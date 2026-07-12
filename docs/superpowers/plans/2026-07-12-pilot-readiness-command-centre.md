# Pilot Readiness Command Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only, fail-closed operational readiness dashboard to `/dashboard/admin/pilot` using live GitHub, Vercel, and PostgreSQL evidence.

**Architecture:** Extend the existing pilot-readiness API with a server-derived `commandCentre` snapshot. A focused service owns source collection, freshness/status mapping, and decision policy; a standalone client component owns presentation while the existing page continues to own fetching and NIR evidence rendering.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma/PostgreSQL, native `fetch`, Vitest, Testing Library, shadcn/ui, Tailwind CSS, lucide-react.

---

### Task 1: Readiness Domain And Source Aggregation

**Files:**

- Create: `lib/pilot-readiness-command-centre.ts`
- Create: `lib/__tests__/pilot-readiness-command-centre.test.ts`

- [ ] **Step 1: Write failing domain tests**

Add fixtures for successful, stale, failed, skipped, and missing workflow runs. Assert that:

```ts
const snapshot = buildPilotCommandCentre({
  now: new Date("2026-07-12T00:00:00.000Z"),
  deployment: productionDeployment,
  workflowRuns: successfulRuns,
  pilotCanaryJobs: [
    { name: "swarm", status: "completed", conclusion: "success" },
  ],
  rlsCoverage: { total: 203, enabled: 203 },
});

expect(snapshot.decision).toBe("GO");
expect(snapshot.blockers).toEqual([]);
expect(snapshot.gates.every((gate) => gate.status === "pass")).toBe(true);
```

Add separate tests proving a stale smoke run, a failed advisor run, a skipped canary swarm, and missing source data each produce a blocking non-green gate and `NO_GO`. Add a deployment test proving Vercel metadata produces branch, SHA, environment, deployment URL, and GitHub commit URL without leaking unrelated environment values.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm exec vitest run lib/__tests__/pilot-readiness-command-centre.test.ts
```

Expected: fail because `@/lib/pilot-readiness-command-centre` does not exist.

- [ ] **Step 3: Implement the domain contract and adapters**

Create these exported contracts:

```ts
export type PilotGateStatus = "pass" | "warning" | "fail" | "unknown";
export type PilotDecision = "GO" | "CONDITIONAL" | "NO_GO";

export interface PilotReadinessGate {
  id: string;
  title: string;
  status: PilotGateStatus;
  blocking: boolean;
  summary: string;
  owner: string;
  nextAction: string;
  sourceLabel: string;
  sourceUrl: string;
  verifiedAt: string | null;
}

export interface PilotCommandCentreSnapshot {
  decision: PilotDecision;
  summary: string;
  generatedAt: string;
  deployment: PilotDeploymentSource;
  gates: PilotReadinessGate[];
  blockers: PilotReadinessGate[];
  counts: { verified: number; needsEvidence: number; blockers: number };
}
```

Implement `buildPilotCommandCentre(inputs)` as a pure function. Use explicit workflow definitions for `pr-checks.yml`, `route-safety.yml`, `smoke-prod.yml`, `supabase-advisor-gate.yml`, `pilot-canary.yml`, and `release-gate.yml`; enforce the freshness windows from the design spec; require a successful `swarm` job for the canary gate; combine live RLS coverage with the advisor run; and derive the decision on the server.

Implement `getPilotCommandCentre()` with `Promise.allSettled` so one failed source becomes `unknown` without failing the full response. Fetch each public GitHub workflow endpoint with `next: { revalidate: 900 }`, GitHub API headers, and no required credential. Query RLS with a static `Prisma.sql` catalogue statement:

```ts
SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE c.relrowsecurity)::int AS enabled
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
```

Do not return raw fetch/database errors. Log source failures internally and convert them to unavailable evidence.

- [ ] **Step 4: Run the domain tests and verify GREEN**

Run the Task 1 Vitest command. Expected: all command-centre domain tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/pilot-readiness-command-centre.ts lib/__tests__/pilot-readiness-command-centre.test.ts
git commit -m "feat(pilot): aggregate live readiness evidence"
```

### Task 2: Protected API Composition

**Files:**

- Modify: `app/api/pilot/readiness/route.ts`
- Create: `app/api/pilot/readiness/__tests__/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Mock `next-auth`, `verifyAdminFromDb`, Prisma, `fromException`, NIR measurement helpers, and `getPilotCommandCentre`. Prove:

```ts
it("returns the command-centre snapshot to a DB-verified admin", async () => {
  verifyAdminFromDbMock.mockResolvedValue({
    user: { id: "admin-1", role: "ADMIN" },
  });
  getPilotCommandCentreMock.mockResolvedValue(commandCentreFixture);

  const response = await GET(
    new NextRequest("http://localhost/api/pilot/readiness"),
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.commandCentre).toEqual(commandCentreFixture);
});
```

Add an unauthorised case that returns the admin verifier response and never loads Prisma or external evidence. Assert the observations query uses explicit `select`, `orderBy`, and `take`.

- [ ] **Step 2: Run the route tests and verify RED**

Run:

```bash
pnpm exec vitest run app/api/pilot/readiness/__tests__/route.test.ts
```

Expected: fail because the response has no `commandCentre` property.

- [ ] **Step 3: Extend the existing route**

Import `getPilotCommandCentre`, call it only after `verifyAdminFromDb()` passes, and add the snapshot to the existing JSON response:

```ts
const commandCentre = await getPilotCommandCentre();

return NextResponse.json({
  commandCentre,
  report,
  cycleTimeSummary,
  meta: {
    generatedAt: report.generatedAt,
    totalObservations: allObservations.length,
    manualObservations: manualNonCycleTime.length,
    derivedObservations: derivedCycleTime.length,
    note: [
      "CLAIM-007 cycle time is auto-derived from completed inspections — no manual entry required.",
      "All other claims require observations submitted via POST /api/pilot/observations.",
      "When readyToPromote is non-empty, update lib/nir-evidence-architecture.ts and open a PR.",
    ],
  },
});
```

Add an explicit `select` to `pilotObservation.findMany` for every mapped field. Keep both Prisma queries bounded at 1,000 rows and preserve existing NIR behavior.

- [ ] **Step 4: Run route and domain tests**

Run both focused Vitest files. Expected: all tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add app/api/pilot/readiness/route.ts app/api/pilot/readiness/__tests__/route.test.ts
git commit -m "feat(pilot): expose protected readiness snapshot"
```

### Task 3: Command Centre UI

**Files:**

- Create: `components/admin/PilotReadinessCommandCentre.tsx`
- Create: `components/admin/__tests__/PilotReadinessCommandCentre.test.tsx`

- [ ] **Step 1: Write failing component tests**

Render a `NO_GO` fixture and assert the visible decision, deployed branch/short SHA, verified count, blocker count, gate titles, owner, evidence timestamp, next action, and source link. Render a `GO` fixture and assert that the blockers section is absent and the all-clear summary is visible. Assert the refresh button invokes the callback and exposes an accessible loading state.

- [ ] **Step 2: Run the component tests and verify RED**

Run:

```bash
pnpm exec vitest run components/admin/__tests__/PilotReadinessCommandCentre.test.tsx
```

Expected: fail because the component does not exist.

- [ ] **Step 3: Implement the responsive component**

Build a focused client component with props:

```ts
interface PilotReadinessCommandCentreProps {
  snapshot: PilotCommandCentreSnapshot;
  refreshing: boolean;
  lastFetched: Date | null;
  onRefresh: () => void;
}
```

Use existing `Button` and `Badge` components plus lucide icons. Render status with icon and text, a compact deployment strip, three stable summary metrics, and a bordered divided gate list that uses a desktop grid and stacked mobile layout. Every source link opens safely with `target="_blank" rel="noreferrer"`. Do not use colour as the only status signal.

- [ ] **Step 4: Run the component tests and verify GREEN**

Run the Task 3 Vitest command. Expected: all component tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add components/admin/PilotReadinessCommandCentre.tsx components/admin/__tests__/PilotReadinessCommandCentre.test.tsx
git commit -m "feat(pilot): add readiness command centre UI"
```

### Task 4: Integrate With Existing Pilot Dashboard

**Files:**

- Modify: `app/dashboard/admin/pilot/page.tsx`

- [ ] **Step 1: Add the typed API field and render the component**

Import `PilotCommandCentreSnapshot` and `PilotReadinessCommandCentre`, add `commandCentre` to `ReadinessResponse`, and render the component as the first page section. Pass the existing `refreshing`, `lastFetched`, and `fetchData(true)` state/callback.

Replace the current page-level NIR-only heading with the command-centre heading from the new component. Add a compact `NIR evidence validation` section heading before the existing NIR overall-status banner. Do not change claim cards, collection links, auto-refresh cadence, or NIR report policy.

The file already contains unrelated formatting-only working-tree changes. Stage only the command-centre integration hunks; leave those pre-existing changes uncommitted and untouched.

- [ ] **Step 2: Run all focused tests**

```bash
pnpm exec vitest run \
  lib/__tests__/pilot-readiness-command-centre.test.ts \
  app/api/pilot/readiness/__tests__/route.test.ts \
  components/admin/__tests__/PilotReadinessCommandCentre.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 3: Run authoritative static validation**

```bash
pnpm type-check
git diff --check -- \
  lib/pilot-readiness-command-centre.ts \
  lib/__tests__/pilot-readiness-command-centre.test.ts \
  app/api/pilot/readiness/route.ts \
  app/api/pilot/readiness/__tests__/route.test.ts \
  components/admin/PilotReadinessCommandCentre.tsx \
  components/admin/__tests__/PilotReadinessCommandCentre.test.tsx \
  app/dashboard/admin/pilot/page.tsx
```

Expected: type-check exits 0 and diff check prints no errors.

- [ ] **Step 4: Commit the integration hunk**

Stage only the intended `page.tsx` hunks, inspect the staged diff, then commit:

```bash
git commit -m "feat(pilot): integrate operational readiness dashboard"
```

### Task 5: Browser Verification And Final Review

**Files:**

- No production file changes expected.

- [ ] **Step 1: Start the development server**

Run `pnpm dev` on the first free local port and record the URL.

- [ ] **Step 2: Verify desktop and mobile**

Use Playwright with an authenticated admin session when available. Verify `/dashboard/admin/pilot` at 1440x900 and 390x844 for no blank state, no overlap, readable gate rows, visible decision/blockers, working refresh, and preserved NIR content.

If admin credentials are unavailable, verify the component through its automated jsdom tests and record browser authentication as an explicit limitation. Do not weaken auth or create a production user.

- [ ] **Step 3: Review the final diff**

Confirm all new API data is admin-only, raw errors are not exposed, GitHub links are constrained to the repository, SQL is static `Prisma.sql`, no schema/dependency change exists, and unrelated worktree changes are absent from staged/committed diffs.

- [ ] **Step 4: Push the completed branch**

```bash
git push origin codex/restoreassist-app-additions-backlog-2026-07-12
```

Expected: remote branch updates successfully. Do not open or merge a PR into `main`.
