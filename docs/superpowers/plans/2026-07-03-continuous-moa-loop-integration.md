# Continuous MOA Loop — Integration Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Plan 1's procedural loop (`.claude/agents/continuous-linear-loop.md`) to Plan 2's real TypeScript routing/MOA functions and Plan 4's tier-selection guidance, via one small CLI script both plans already anticipated needing but explicitly left for a reconciliation step.

**Architecture:** Plans 1, 2, and 4 were written by independent agents with no cross-visibility, each correctly scoped to its own concern and each correctly flagging that a human/later pass would need to bind them together. This plan is that binding pass. It is deliberately small: one new script, one small new function (a concrete `TierSelector` implementation — Plan 2 defined the *type* and left a `sonnet-5`-only placeholder; Plan 4 documented the *rule* as prose for a different repo's skill file; nobody yet wrote the rule as code), and two edits to Plan 1's already-built Cycle Steps.

**Tech Stack:** TypeScript, Vitest, the existing `lib/agents/routing/*.ts` modules from Plan 2, `lib/linear-loop/*.ts` from Plan 1.

## Global Constraints

- This plan assumes Plans 1, 2, and 4 have already been implemented (their files exist on disk as specified in those plans) — if executed before them, Task 1's imports will fail to resolve; that failure is expected and means "come back after 1/2/4 land."
- No new architecture decisions here — every function signature this plan writes against was already fixed by Plans 1/2/4. If a signature has drifted since those plans were implemented, stop and reconcile against the actual code, not this document.

---

### Task 1: Concrete `TierSelector` implementation

**Files:**
- Create: `lib/agents/routing/tier-selector.ts`
- Test: `lib/agents/routing/__tests__/tier-selector.test.ts`

**Interfaces:**
- Consumes: `ModelTier` type and `TierSelector` type from `lib/agents/routing/*.ts` (Plan 2, Task 3/5 — exact export location: wherever Plan 2's implementation put `export type ModelTier = "fable-5" | "opus-4.8" | "sonnet-5" | "haiku-4.5"` and `export type TierSelector = (context: {...}) => ModelTier` — confirm the exact file via `grep -rn "export type TierSelector" lib/agents/routing/`).
- Produces: `defaultTierSelector: TierSelector` — the first real implementation of that type, encoding Plan 4's documented rule (Pi-Dev-Ops `nexus/SKILL.md`'s "Tier selection" subsection) as code instead of prose.

- [ ] **Step 1: Read Plan 4's exact tier-selection prose one more time to confirm the four rules**

Run: `grep -n -A5 "Fable 5:\|Opus 4.8:\|Sonnet 5:\|Haiku 4.5:" /Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md`
Expected: four bullet blocks matching spec §5 — Fable 5 for boardroom synthesis/judge-gate/cross-skill-synthesis-after-MOA; Opus 4.8 for single-specialist ambiguous work; Sonnet 5 default; Haiku 4.5 mechanical-only.

- [ ] **Step 2: Write the failing test**

```typescript
// lib/agents/routing/__tests__/tier-selector.test.ts
import { describe, expect, it } from "vitest";
import { defaultTierSelector } from "../tier-selector";

describe("defaultTierSelector", () => {
  it("selects fable-5 when this is a MOA synthesis step", () => {
    const tier = defaultTierSelector({
      isMoaSynthesis: true,
      isJudgeGate: false,
      bucket: "architecture",
      isAmbiguous: false,
      isMechanical: false,
    });
    expect(tier).toBe("fable-5");
  });

  it("selects fable-5 for a judge/spec-gate decision", () => {
    const tier = defaultTierSelector({
      isMoaSynthesis: false,
      isJudgeGate: true,
      bucket: "feature",
      isAmbiguous: false,
      isMechanical: false,
    });
    expect(tier).toBe("fable-5");
  });

  it("selects opus-4.8 for a single-specialist ambiguous dispatch", () => {
    const tier = defaultTierSelector({
      isMoaSynthesis: false,
      isJudgeGate: false,
      bucket: "design",
      isAmbiguous: true,
      isMechanical: false,
    });
    expect(tier).toBe("opus-4.8");
  });

  it("defaults to sonnet-5 for routine dev/copy work", () => {
    const tier = defaultTierSelector({
      isMoaSynthesis: false,
      isJudgeGate: false,
      bucket: "bug",
      isAmbiguous: false,
      isMechanical: false,
    });
    expect(tier).toBe("sonnet-5");
  });

  it("selects haiku-4.5 for mechanical single-increment work", () => {
    const tier = defaultTierSelector({
      isMoaSynthesis: false,
      isJudgeGate: false,
      bucket: "bug",
      isAmbiguous: false,
      isMechanical: true,
    });
    expect(tier).toBe("haiku-4.5");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/agents/routing/__tests__/tier-selector.test.ts`
Expected: FAIL — `Cannot find module '../tier-selector'`

- [ ] **Step 4: Write the implementation**

```typescript
// lib/agents/routing/tier-selector.ts
import type { ModelTier, TierSelector, WorkTypeBucket } from "./index";

export interface TierSelectionContext {
  isMoaSynthesis: boolean;
  isJudgeGate: boolean;
  bucket: WorkTypeBucket;
  isAmbiguous: boolean;
  isMechanical: boolean;
}

/**
 * Encodes Pi-Dev-Ops nexus/SKILL.md's "Tier selection" rule (spec §5) as code.
 * Order matters — checked top to bottom, first match wins.
 */
export const defaultTierSelector: TierSelector = (context) => {
  const ctx = context as unknown as TierSelectionContext;
  if (ctx.isMoaSynthesis || ctx.isJudgeGate) return "fable-5";
  if (ctx.isMechanical) return "haiku-4.5";
  if (ctx.isAmbiguous) return "opus-4.8";
  return "sonnet-5";
};
```

Note: `context` is typed as `unknown as TierSelectionContext` because Plan 2's `TierSelector` type signature was written before this concrete shape existed — if Plan 2's actual `context` parameter type differs from `TierSelectionContext` above, update `TierSelectionContext` to match Plan 2's real type rather than casting around a mismatch.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/agents/routing/__tests__/tier-selector.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add lib/agents/routing/tier-selector.ts lib/agents/routing/__tests__/tier-selector.test.ts
git commit -m "feat(loop): concrete defaultTierSelector implementing nexus tier-selection rule"
```

---

### Task 2: The decision CLI script

**Files:**
- Create: `scripts/linear-loop-decide.ts`
- Test: `scripts/__tests__/linear-loop-decide.test.ts`

**Interfaces:**
- Consumes: `isOwnerGated` (Plan 1, `lib/linear-loop/owner-gated.ts`), `classifyWorkItem` + `routeToSkills` + `shouldFanOut` + `wrapWithNexus` (Plan 2, `lib/agents/routing/*.ts`), `defaultTierSelector` (Task 1 above).
- Produces: a CLI invoked as `npx tsx scripts/linear-loop-decide.ts --issue-json '<json>'`, printing one JSON line to stdout: `{ ownerGated: boolean, ownerGatedReason?: string, bucket: WorkTypeBucket, routedSkills: string[], moa: MoaDecision, tier: ModelTier, wrappedPrompt: string }`. This is the exact artifact Plan 1's Cycle Steps 2 and 4 (Task 3 below) read.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/__tests__/linear-loop-decide.test.ts
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

describe("linear-loop-decide CLI", () => {
  it("outputs a decision JSON for a routine bug issue", () => {
    const issue = {
      id: "RA-9999",
      title: "Fix a null pointer in the report renderer",
      description: "Reports crash when totalCost is null.",
      labels: [],
      team: "RestoreAssist",
    };
    const out = execSync(
      `npx tsx scripts/linear-loop-decide.ts --issue-json '${JSON.stringify(issue)}'`,
      { encoding: "utf-8" },
    );
    const decision = JSON.parse(out.trim());
    expect(decision.ownerGated).toBe(false);
    expect(decision.bucket).toBe("bug");
    expect(decision.moa.fanOut).toBe(false);
    expect(decision.tier).toBe("sonnet-5");
    expect(typeof decision.wrappedPrompt).toBe("string");
    expect(decision.wrappedPrompt).toContain("TASK:");
  });

  it("flags an owner-gated issue and skips routing entirely", () => {
    const issue = {
      id: "RA-9998",
      title: "Run the pilot cutover migration",
      description: "Owner-action gated — Claude won't run prod migrations.",
      labels: [],
      team: "RestoreAssist",
    };
    const out = execSync(
      `npx tsx scripts/linear-loop-decide.ts --issue-json '${JSON.stringify(issue)}'`,
      { encoding: "utf-8" },
    );
    const decision = JSON.parse(out.trim());
    expect(decision.ownerGated).toBe(true);
    expect(decision.ownerGatedReason).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/__tests__/linear-loop-decide.test.ts`
Expected: FAIL — `scripts/linear-loop-decide.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// scripts/linear-loop-decide.ts
import { isOwnerGated } from "../lib/linear-loop/owner-gated";
import {
  classifyWorkItem,
  routeToSkills,
  shouldFanOut,
  wrapWithNexus,
  type LinearIssueInput,
} from "../lib/agents/routing";
import { defaultTierSelector } from "../lib/agents/routing/tier-selector";

function parseArgs(): LinearIssueInput {
  const flagIndex = process.argv.indexOf("--issue-json");
  if (flagIndex === -1 || !process.argv[flagIndex + 1]) {
    throw new Error("Usage: linear-loop-decide.ts --issue-json '<json>'");
  }
  return JSON.parse(process.argv[flagIndex + 1]) as LinearIssueInput;
}

function main(): void {
  const issue = parseArgs();

  const ownerGate = isOwnerGated(issue.labels ?? [], issue.description ?? "");
  if (ownerGate.gated) {
    process.stdout.write(
      JSON.stringify({
        ownerGated: true,
        ownerGatedReason: ownerGate.reason,
      }) + "\n",
    );
    return;
  }

  const classification = classifyWorkItem(issue);
  const routedSkills = routeToSkills(classification.bucket);
  const moa = shouldFanOut({
    bucket: classification.bucket,
    routedSkills,
    issue,
  });

  const tier = defaultTierSelector({
    isMoaSynthesis: moa.fanOut,
    isJudgeGate: routedSkills.some((s) => s.skill === "judge"),
    bucket: classification.bucket,
    isAmbiguous: classification.bucket === "design" || classification.bucket === "security",
    isMechanical: false,
  } as never);

  const wrappedPrompt = wrapWithNexus(
    `Implement Linear issue ${issue.id}: ${issue.title}\n\n${issue.description ?? ""}`,
  );

  process.stdout.write(
    JSON.stringify({
      ownerGated: false,
      bucket: classification.bucket,
      routedSkills: routedSkills.map((s) => s.skill),
      moa,
      tier,
      wrappedPrompt,
    }) + "\n",
  );
}

main();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/__tests__/linear-loop-decide.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/linear-loop-decide.ts scripts/__tests__/linear-loop-decide.test.ts
git commit -m "feat(loop): decision CLI binding owner-gate + routing + MOA + tier-selection"
```

---

### Task 3: Wire Plan 1's Cycle Steps 2 and 4 to the decision script

**Files:**
- Modify: `.claude/agents/continuous-linear-loop.md` (created by Plan 1, Task 4)

**Interfaces:**
- Consumes: Task 2's `scripts/linear-loop-decide.ts` CLI contract.
- Produces: an updated Cycle Step 2 (owner-gate check now reads the script's `ownerGated`/`ownerGatedReason` fields instead of calling `isOwnerGated` directly) and Cycle Step 4 (dispatch now branches on `moa.fanOut`: `false` → the existing single-agent Nexus-wrapped dispatch Plan 1 already wrote, using `wrappedPrompt` and `tier` from the script's output; `true` → invoke the `boardroom` skill with `routedSkills` as the panellist brief instead).

- [ ] **Step 1: Locate the exact current Cycle Step 2 and Cycle Step 4 text**

Run: `grep -n "^### Cycle Step 2\|^### Cycle Step 4" .claude/agents/continuous-linear-loop.md`
Expected: two line numbers — note them, this Edit must target the real current content, not a guess.

- [ ] **Step 2: Edit Cycle Step 2 to call the decision script**

Use the Edit tool. Read the current Cycle Step 2 block in full first (from the line found in Step 1 to the next `### Cycle Step` heading), then replace its body with:

```markdown
Run the decision script once for this issue and keep its output for Cycle Step 4:

`npx tsx scripts/linear-loop-decide.ts --issue-json '<issue-as-json>'`

Parse the single JSON line printed to stdout. If `ownerGated` is `true`: this is Cycle Step 2's existing skip-and-comment path (unchanged) — use `ownerGatedReason` as the comment text, increment the stop-guard tracker's unactionable-skip counter, return to Cycle Step 1. If `ownerGated` is `false`: keep the full decision object (`bucket`, `routedSkills`, `moa`, `tier`, `wrappedPrompt`) — Cycle Step 4 consumes it, do not re-run the script.
```

- [ ] **Step 3: Edit Cycle Step 4 to branch on `moa.fanOut`**

Read the current Cycle Step 4 block in full, then replace its body with:

```markdown
Using Cycle Step 2's decision object:

**If `moa.fanOut` is `false`** (the common case — matches Plan 1's original single-agent design exactly): dispatch one Nexus-wrapped sub-agent using `wrappedPrompt` verbatim as the task body, at model tier `tier`, following the same "do not open a PR yourself" contract already documented below.

**If `moa.fanOut` is `true`**: instead of a single dispatch, invoke the `boardroom` skill (Pi-Dev-Ops `skills/boardroom/SKILL.md`) with `routedSkills` informing which personas/panellists to brief — each panellist receives `wrappedPrompt` as their base task, with a persona-specific framing drawn from their routed skill. Boardroom's own synthesiser produces the final implementation instruction; treat its `answer` field as what Cycle Step 4's single-dispatch path would have received, and continue with the same "confirm verification" (Cycle Step 5) and PR-open (Cycle Step 6) steps unchanged. Use tier `tier` (already computed as `fable-5` when `moa.fanOut` is true, per Task 1's selector) for the synthesis/arbiter role specifically — individual panellists use boardroom's own default panel config, not this tier value.

In both branches, the rest of Cycle Step 4 (do not open a PR yourself; the calling procedure's Cycle Step 5/6 do that) is unchanged from Plan 1's original text.
```

- [ ] **Step 4: Verify the file still has exactly 8 numbered Cycle Steps**

Run: `grep -c "^### Cycle Step" .claude/agents/continuous-linear-loop.md`
Expected: `8` (unchanged count — this task edits the *content* of Steps 2 and 4, not the count).

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/continuous-linear-loop.md
git commit -m "feat(loop): wire Cycle Steps 2/4 to the routing+MOA+tier decision script"
```

---

## Self-Review

**Spec coverage:** every consumption seam Plans 1, 2, and 4 each explicitly flagged as "left for reconciliation" is addressed: Plan 2's `TierSelector` placeholder → Task 1's real implementation; Plan 1/Plan 2's assumed-but-nonexistent `dispatchWorkItem` interface → replaced entirely by the decision-script pattern (Task 2), which is a cleaner seam than either plan originally assumed since it doesn't require Plan 1's markdown procedure to literally import TypeScript; Plan 1's single-agent-only Cycle Step 4 → Task 3 adds the MOA branch without disturbing the single-agent path Plan 1 already built and tested.

**Placeholder scan:** none found — every step has complete, runnable code and exact commands.

**Type consistency:** `TierSelectionContext` in Task 1 is explicitly flagged as needing reconciliation against Plan 2's actual `TierSelector` parameter type if they differ — this is a real, disclosed risk (not a placeholder) because this plan is written against Plans 2/4's *specified* interfaces before Task execution has produced the real code to check against. Whoever executes this plan should diff `TierSelectionContext` against the real `TierSelector` type first, per Task 1 Step 4's note.

**Known residual gap (out of scope for this plan, inherited from Plan 5):** the session-handoff↔Nexus connector still requires RestoreAssist to have `scripts/handoff-loop.sh` and `docs/session-handoffs/` before it produces real handoffs — Plan 5 documented this as a prerequisite gap, not something this integration plan fixes.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-03-continuous-moa-loop-integration.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
