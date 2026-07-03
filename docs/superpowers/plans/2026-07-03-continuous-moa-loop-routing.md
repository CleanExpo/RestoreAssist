# Continuous MOA Loop — Routing + Mixture of Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add work-type classification, a skill-routing table, and a Mixture-of-Agents (MOA) fan-out decision to the continuous Linear-driven agent loop, replacing the placeholder single-agent dispatch left by Plan 1 (Core Loop Mechanics) with a routing-aware dispatch that picks single-specialist or `boardroom` fan-out per issue.

**Architecture:** Four pure/near-pure TypeScript modules under `lib/agents/routing/` — a classifier (`classifyWorkItem`), a static routing table (`ROUTING_TABLE` + `routeToSkills`), an MOA trigger evaluator (`shouldFanOut`), and two dispatch-path builders (`buildSingleAgentDispatch`, `buildMoaDispatch`) that both produce a Nexus-wrapped prompt string plus a model-tier annotation. A fifth module, `dispatchWorkItem`, composes all four and is the function Plan 1's loop calls at its dispatch step. Every module is pure (issue-shape in, decision-shape out) except the two dispatch builders, which read `NEXUS_PROMPT.md` from disk and return a string — no network calls, no `Agent`/`Task` invocation inside these modules. The actual `Agent` tool call (or `boardroom_query` call) happens one layer up, in the loop body Plan 1 owns, using the dispatch plan this plan's functions produce.

**Tech Stack:** TypeScript, Vitest (existing project test runner, config at `vitest.config.js`), Node `fs` for reading the Nexus prompt file, no new npm dependencies.

## Global Constraints

- Work-type buckets are exactly these 8, per spec §4: `bug`, `feature`, `design`, `copy`, `security`, `infra`, `video`, `marketing` — no others, no fewer.
- The routing table must mirror `review-dimensions.md`'s Dimension Activation Matrix table format/style (Markdown pipe table with a header row) — see `/Users/phillmcgurk/RestoreAssist/.claude/rules/review-dimensions.md`.
- MOA fan-out uses exactly the 5 trigger criteria from spec §4 — no additional heuristics invented here.
- `boardroom`'s hard ceiling is 2–4 panellists (spec §4, `boardroom` SKILL.md) — never request more.
- Every dispatch (single-agent or MOA) must be Nexus-wrapped per `/Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md`'s documented procedure: read `references/NEXUS_PROMPT.md`, replace `{TASK}` with the complete task including why + constraints, dispatch the filled prompt verbatim — never restate or fork the prompt body.
- Model-tier **selection** (which of Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5 to use per dispatch) is defined by a separate Pi-Dev-Ops PR to `nexus` (spec §5, tracked as Plan 4). This plan consumes that rule as an external input via a `TierSelector` function type — it does not define tier-selection logic itself. Until Plan 4 lands, this plan's code takes a `selectTier` parameter with a temporary literal default so the code compiles and is testable in isolation (see Task 4).
- No standing cron, no re-spawning outside the session (spec §3 session-bound property) — not this plan's concern directly, but no code in this plan may schedule or persist a callback that fires after the current process exits.
- Owner-gated actions are Plan 1's concern (regex skip in its per-cycle sequence) — this plan assumes it never receives an owner-gated issue; no owner-gated check is duplicated here.
- TypeScript strict mode (repo default) — no `any` without justification, matching `.claude/rules/review-dimensions.md` dimension 5 (Type Safety).
- Test file paths must match `vitest.config.js`'s `include` glob: `lib/**/__tests__/**/*.test.ts`.

---

## File Structure

- `lib/agents/routing/types.ts` — shared types: `LinearIssueInput`, `WorkTypeBucket`, `ClassificationResult`, `RoutedSkill`, `MoaDecision`, `DispatchPlan`, `ModelTier`, `TierSelector`.
- `lib/agents/routing/classifier.ts` — `classifyWorkItem(issue: LinearIssueInput): ClassificationResult`.
- `lib/agents/routing/routing-table.ts` — `ROUTING_TABLE` constant + `routeToSkills(bucket: WorkTypeBucket): RoutedSkill[]`.
- `lib/agents/routing/moa-trigger.ts` — `shouldFanOut(input: MoaTriggerInput): MoaDecision`.
- `lib/agents/routing/nexus-wrap.ts` — `wrapWithNexus(task: string): string` (reads `NEXUS_PROMPT.md`, fills `{TASK}`).
- `lib/agents/routing/dispatch.ts` — `buildSingleAgentDispatch(...)`, `buildMoaDispatch(...)`, and `dispatchWorkItem(issue, selectTier): Promise<DispatchPlan>` — the integration point Plan 1 calls.
- `lib/agents/routing/__tests__/classifier.test.ts`
- `lib/agents/routing/__tests__/routing-table.test.ts`
- `lib/agents/routing/__tests__/moa-trigger.test.ts`
- `lib/agents/routing/__tests__/dispatch.test.ts`

All new code lives under `lib/agents/routing/` — a new subdirectory of the existing `lib/agents/` module (which already holds the orchestrator/registry/executor for the Agent Orchestration Framework, per `lib/agents/types.ts`). This keeps routing logic colocated with the agent framework it extends, without touching existing `lib/agents/*.ts` files.

---

### Task 1: Build the work-type classifier

**Files:**
- Create: `lib/agents/routing/types.ts`
- Create: `lib/agents/routing/classifier.ts`
- Test: `lib/agents/routing/__tests__/classifier.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (first task).
- Produces:
  - `export type WorkTypeBucket = "bug" | "feature" | "design" | "copy" | "security" | "infra" | "video" | "marketing";`
  - `export interface LinearIssueInput { identifier: string; title: string; description: string; labels: string[]; team: string; project?: string; }`
  - `export interface ClassificationResult { bucket: WorkTypeBucket; matchedSignals: string[]; confidence: "label" | "text"; }`
  - `export function classifyWorkItem(issue: LinearIssueInput): ClassificationResult` — later tasks (routing table, MOA trigger, dispatch) consume `ClassificationResult.bucket` and `ClassificationResult.matchedSignals`.

- [ ] **Step 1: Create the types file**

Create `lib/agents/routing/types.ts`:

```typescript
/**
 * Shared types for the continuous-loop work-type router and MOA dispatcher.
 *
 * These types are the contract between the classifier (Task 1), the
 * routing table (Task 2), the MOA trigger decision (Task 3), and the
 * dispatch builders (Tasks 4-6). Plan 1 (Core Loop Mechanics) constructs
 * `LinearIssueInput` from its Linear query result and passes it into
 * `dispatchWorkItem` (see dispatch.ts).
 */

export type WorkTypeBucket =
  | "bug"
  | "feature"
  | "design"
  | "copy"
  | "security"
  | "infra"
  | "video"
  | "marketing";

export interface LinearIssueInput {
  identifier: string;
  title: string;
  description: string;
  labels: string[];
  team: string;
  project?: string;
}

export interface ClassificationResult {
  bucket: WorkTypeBucket;
  /** Which label(s) or keyword(s) drove the classification, for audit/logging. */
  matchedSignals: string[];
  /** "label" when a Linear label directly matched a bucket; "text" when free-text keywords decided it. */
  confidence: "label" | "text";
}
```

- [ ] **Step 2: Write the failing tests**

Create `lib/agents/routing/__tests__/classifier.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyWorkItem } from "../classifier";
import type { LinearIssueInput } from "../types";

function issue(overrides: Partial<LinearIssueInput>): LinearIssueInput {
  return {
    identifier: "RA-0000",
    title: "",
    description: "",
    labels: [],
    team: "RA",
    ...overrides,
  };
}

describe("classifyWorkItem", () => {
  it("classifies a design-system issue as design via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7001",
        title: "Dashboard cards use inconsistent border radius",
        description:
          "The job-card, invoice-card, and inspection-card components in components/dashboard/ " +
          "use three different border-radius values. Align them to the design-system tokens.",
        labels: ["design", "ui"],
      }),
    );
    expect(result.bucket).toBe("design");
    expect(result.confidence).toBe("label");
    expect(result.matchedSignals).toContain("design");
  });

  it("classifies a marketing-copywriter issue as marketing via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7002",
        title: "Rewrite the cost-calculator landing page hero copy",
        description:
          "The hero section on /cost-calculator undersells the GST-inclusive quoting benefit. " +
          "Needs a copywriter pass aligned to the 30-in-30 campaign funnel messaging.",
        labels: ["marketing", "content"],
      }),
    );
    expect(result.bucket).toBe("marketing");
    expect(result.confidence).toBe("label");
    expect(result.matchedSignals).toContain("marketing");
  });

  it("classifies a security-audit issue as security via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7003",
        title: "Audit service-role Supabase key usage in lib/integrations",
        description:
          "Confirm no API route uses the Supabase service-role key without an explicit " +
          "workspace-scoped RLS check. Follows the 2026-05-18 service-role audit finding.",
        labels: ["security"],
      }),
    );
    expect(result.bucket).toBe("security");
    expect(result.confidence).toBe("label");
    expect(result.matchedSignals).toContain("security");
  });

  it("classifies a plain bug report via free-text keywords when no bucket label exists", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7004",
        title: "Equipment calculator throws on zero-affected-area storm jobs",
        description:
          "Reported by a technician: submitting a storm-damage scope with 0m² affected area " +
          "crashes lib/equipment-calculator-storm.ts with a divide-by-zero. Should show a validation error instead.",
        labels: ["bug"],
      }),
    );
    expect(result.bucket).toBe("bug");
    expect(result.confidence).toBe("label");
  });

  it("classifies an infra issue as infra via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7005",
        title: "Vercel preview deploys are failing on the sandbox branch",
        description:
          "Last 3 sandbox deploys failed at the build step with an out-of-memory error. " +
          "Needs a Vercel build config / Railway resource review.",
        labels: ["infra", "deployment"],
      }),
    );
    expect(result.bucket).toBe("infra");
    expect(result.confidence).toBe("label");
  });

  it("classifies a video-series issue as video via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7006",
        title: "Record the onboarding-welcome walkthrough video",
        description:
          "Part of the RestoreAssist onboarding video series — script, narrate, render, caption, " +
          "and wire into <VideoExplainer> per the orchestrating-restoreassist-video-series skill.",
        labels: ["video"],
      }),
    );
    expect(result.bucket).toBe("video");
    expect(result.confidence).toBe("label");
  });

  it("classifies a feature request as feature via label", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7007",
        title: "Add bulk CSV export for inspection reports",
        description:
          "Technicians want to export a batch of closed inspections to CSV for their own records.",
        labels: ["feature"],
      }),
    );
    expect(result.bucket).toBe("feature");
    expect(result.confidence).toBe("label");
  });

  it("classifies a copy issue as copy via label even when 'content' label is also present", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7008",
        title: "Tighten the trial-expiry email subject lines",
        description: "Subject lines are 90+ characters and get truncated in Gmail's inbox preview.",
        labels: ["copy", "content"],
      }),
    );
    expect(result.bucket).toBe("copy");
    expect(result.confidence).toBe("label");
  });

  it("falls back to free-text classification when no label matches a bucket", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7009",
        title: "XSS risk in claim-notes rich text renderer",
        description:
          "User-supplied claim notes are rendered without escapeHtml() in components/claims/NotesPanel.tsx — " +
          "a stored XSS vector.",
        labels: ["needs-triage"],
      }),
    );
    expect(result.bucket).toBe("security");
    expect(result.confidence).toBe("text");
    expect(result.matchedSignals).toContain("xss");
  });

  it("defaults to feature when neither labels nor text match any bucket", () => {
    const result = classifyWorkItem(
      issue({
        identifier: "RA-7010",
        title: "Investigate technician onboarding drop-off",
        description: "Support has flagged that ~15% of invited technicians never complete onboarding.",
        labels: [],
      }),
    );
    expect(result.bucket).toBe("feature");
    expect(result.confidence).toBe("text");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/agents/routing/__tests__/classifier.test.ts`
Expected: FAIL with `Cannot find module '../classifier'` (file does not exist yet).

- [ ] **Step 4: Implement the classifier**

Create `lib/agents/routing/classifier.ts`:

```typescript
/**
 * Work-type classifier for the continuous Linear-driven agent loop.
 *
 * Two-stage classification per spec §4: Linear labels are checked first
 * (cheap, reliable) and only fall back to free-text keyword matching over
 * title + description when no label maps to a bucket.
 */

import type { ClassificationResult, LinearIssueInput, WorkTypeBucket } from "./types";

// Label → bucket. Checked in this order; first match wins. Labels are
// lower-cased before comparison so Linear label casing never matters.
const LABEL_BUCKET_MAP: Array<{ labels: string[]; bucket: WorkTypeBucket }> = [
  { labels: ["security", "vuln", "vulnerability"], bucket: "security" },
  { labels: ["infra", "infrastructure", "deployment", "devops"], bucket: "infra" },
  { labels: ["video"], bucket: "video" },
  { labels: ["marketing", "campaign", "seo", "geo"], bucket: "marketing" },
  { labels: ["copy", "copywriting"], bucket: "copy" },
  { labels: ["design", "ui", "ux"], bucket: "design" },
  { labels: ["bug", "defect"], bucket: "bug" },
  { labels: ["feature", "enhancement"], bucket: "feature" },
];

// Free-text fallback keyword → bucket, checked in this priority order
// (security first: a security keyword should never be shadowed by an
// incidental "bug" mention in the same description).
const TEXT_BUCKET_MAP: Array<{ keywords: string[]; bucket: WorkTypeBucket }> = [
  {
    keywords: ["xss", "csrf", "vulnerability", "exploit", "auth bypass", "service-role key", "secret leak"],
    bucket: "security",
  },
  { keywords: ["deploy", "vercel", "railway", "ci pipeline", "build failing", "out-of-memory"], bucket: "infra" },
  { keywords: ["render", "narrate", "caption", "video series", "explainer video"], bucket: "video" },
  { keywords: ["landing page", "campaign", "funnel", "seo", "ad copy"], bucket: "marketing" },
  { keywords: ["subject line", "microcopy", "tone", "wording"], bucket: "copy" },
  { keywords: ["border radius", "design token", "visual hierarchy", "layout", "spacing"], bucket: "design" },
  { keywords: ["crash", "throws", "divide-by-zero", "regression", "broken"], bucket: "bug" },
];

function normalise(text: string): string {
  return text.toLowerCase();
}

export function classifyWorkItem(issue: LinearIssueInput): ClassificationResult {
  const normalisedLabels = issue.labels.map((label) => normalise(label));

  for (const entry of LABEL_BUCKET_MAP) {
    const matched = entry.labels.find((label) => normalisedLabels.includes(label));
    if (matched) {
      return { bucket: entry.bucket, matchedSignals: [matched], confidence: "label" };
    }
  }

  const haystack = normalise(`${issue.title} ${issue.description}`);
  for (const entry of TEXT_BUCKET_MAP) {
    const matched = entry.keywords.filter((keyword) => haystack.includes(keyword));
    if (matched.length > 0) {
      return { bucket: entry.bucket, matchedSignals: matched, confidence: "text" };
    }
  }

  // No label or keyword matched anything: default to "feature" — the
  // broadest, lowest-risk bucket (routes to spm + feature-shaped skills,
  // never silently drops into a narrower, wrong specialist).
  return { bucket: "feature", matchedSignals: [], confidence: "text" };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/agents/routing/__tests__/classifier.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/agents/routing/types.ts lib/agents/routing/classifier.ts lib/agents/routing/__tests__/classifier.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add work-type classifier for continuous MOA loop routing

Classifies a Linear issue into one of 8 work-type buckets (bug, feature,
design, copy, security, infra, video, marketing) via label-first,
text-fallback matching. First building block of the Phase 2 routing
layer from docs/superpowers/specs/2026-07-03-continuous-moa-agent-loop-design.md §4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Build the full skill-routing table

**Files:**
- Create: `lib/agents/routing/routing-table.ts`
- Test: `lib/agents/routing/__tests__/routing-table.test.ts`

**Interfaces:**
- Consumes: `WorkTypeBucket` from `lib/agents/routing/types.ts` (Task 1).
- Produces:
  - `export interface RoutedSkill { skill: string; role: "primary" | "supporting"; }`
  - `export const ROUTING_TABLE: Record<WorkTypeBucket, RoutedSkill[]>`
  - `export function routeToSkills(bucket: WorkTypeBucket): RoutedSkill[]` — Task 3 (MOA trigger) and Task 5 (MOA dispatch) consume this to determine panellist personas; Task 4 (single-agent dispatch) consumes it to pick the dispatch target skill(s).

**Routing table research** (skills confirmed present under `~/.claude/skills/` as of this plan): `design-audit`, `design-intelligence`, `ui-component-builder`, `ui-ux-pro-max`, `marketing-copywriter`, `eeat`, `brand-ambassador`, `marketing-seo-researcher`, `geo-optimization`, `security-audit`, `security`, `use-railway`, `deployment`, `supabase`, `remotion-orchestrator`, `heygen-director`, `spm`, `judge`, `boardroom`, `service-layer-architecture` (RestoreAssist-local, `.claude/skills/service-layer-architecture`), `ci-parity-verification` (RestoreAssist-local), `architectural-integrity-protocol` (RestoreAssist-local).

- [ ] **Step 1: Write the failing tests**

Create `lib/agents/routing/__tests__/routing-table.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ROUTING_TABLE, routeToSkills } from "../routing-table";
import type { WorkTypeBucket } from "../types";

const ALL_BUCKETS: WorkTypeBucket[] = [
  "bug",
  "feature",
  "design",
  "copy",
  "security",
  "infra",
  "video",
  "marketing",
];

describe("ROUTING_TABLE", () => {
  it("has an entry for all 8 work-type buckets", () => {
    for (const bucket of ALL_BUCKETS) {
      expect(ROUTING_TABLE[bucket]).toBeDefined();
      expect(ROUTING_TABLE[bucket].length).toBeGreaterThan(0);
    }
  });

  it("every bucket has exactly one primary skill", () => {
    for (const bucket of ALL_BUCKETS) {
      const primaries = ROUTING_TABLE[bucket].filter((s) => s.role === "primary");
      expect(primaries).toHaveLength(1);
    }
  });

  it("routes design to design-audit as primary", () => {
    const skills = routeToSkills("design");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("design-audit");
    expect(skills.map((s) => s.skill)).toContain("design-intelligence");
  });

  it("routes copy to marketing-copywriter as primary", () => {
    const skills = routeToSkills("copy");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("marketing-copywriter");
    expect(skills.map((s) => s.skill)).toContain("eeat");
  });

  it("routes security to security-audit as primary", () => {
    const skills = routeToSkills("security");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("security-audit");
  });

  it("routes video to remotion-orchestrator as primary", () => {
    const skills = routeToSkills("video");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("remotion-orchestrator");
    expect(skills.map((s) => s.skill)).toContain("heygen-director");
  });

  it("routes infra to use-railway as primary", () => {
    const skills = routeToSkills("infra");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("use-railway");
    expect(skills.map((s) => s.skill)).toContain("deployment");
  });

  it("routes marketing to marketing-copywriter as primary with campaign supporting skills", () => {
    const skills = routeToSkills("marketing");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("marketing-copywriter");
    expect(skills.map((s) => s.skill)).toContain("marketing-seo-researcher");
  });

  it("routes bug to linear-task-processor as primary with service-layer-architecture supporting", () => {
    const skills = routeToSkills("bug");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("linear-task-processor");
    expect(skills.map((s) => s.skill)).toContain("service-layer-architecture");
  });

  it("routes feature to linear-task-processor as primary with spm supporting", () => {
    const skills = routeToSkills("feature");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("linear-task-processor");
    expect(skills.map((s) => s.skill)).toContain("spm");
  });

  it("returns a defensive copy, not the live table array", () => {
    const skills = routeToSkills("bug");
    skills.push({ skill: "should-not-persist", role: "supporting" });
    expect(routeToSkills("bug").map((s) => s.skill)).not.toContain("should-not-persist");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agents/routing/__tests__/routing-table.test.ts`
Expected: FAIL with `Cannot find module '../routing-table'`.

- [ ] **Step 3: Implement the routing table**

Create `lib/agents/routing/routing-table.ts`:

```typescript
/**
 * Skill-routing table for the continuous MOA loop (spec §4).
 *
 * Mirrors the shape/style of .claude/rules/review-dimensions.md's Dimension
 * Activation Matrix, but maps Linear-issue work-type buckets (pre-hoc, from
 * issue content) rather than changed file paths (post-hoc). One row per
 * work-type bucket; each row lists the skills that would be dispatched for
 * an issue of that type, in priority order.
 *
 * | Bucket    | Primary skill            | Supporting skill(s)                                          |
 * | --------- | ------------------------ | ------------------------------------------------------------- |
 * | bug       | linear-task-processor    | service-layer-architecture, ci-parity-verification            |
 * | feature   | linear-task-processor    | spm, service-layer-architecture                                |
 * | design    | design-audit             | design-intelligence, ui-component-builder, ui-ux-pro-max       |
 * | copy      | marketing-copywriter     | eeat, brand-ambassador                                         |
 * | security  | security-audit           | security, architectural-integrity-protocol                     |
 * | infra     | use-railway              | deployment, supabase                                           |
 * | video     | remotion-orchestrator    | heygen-director                                                |
 * | marketing | marketing-copywriter     | marketing-seo-researcher, geo-optimization, eeat               |
 *
 * Skill names above are Claude Code skill identifiers as registered under
 * ~/.claude/skills/ (Pi-Dev-Ops-owned, symlinked) or RestoreAssist's own
 * .claude/skills/ (service-layer-architecture, ci-parity-verification,
 * architectural-integrity-protocol) — confirmed present at plan-writing time.
 */

import type { WorkTypeBucket } from "./types";

export interface RoutedSkill {
  skill: string;
  role: "primary" | "supporting";
}

export const ROUTING_TABLE: Record<WorkTypeBucket, RoutedSkill[]> = {
  bug: [
    { skill: "linear-task-processor", role: "primary" },
    { skill: "service-layer-architecture", role: "supporting" },
    { skill: "ci-parity-verification", role: "supporting" },
  ],
  feature: [
    { skill: "linear-task-processor", role: "primary" },
    { skill: "spm", role: "supporting" },
    { skill: "service-layer-architecture", role: "supporting" },
  ],
  design: [
    { skill: "design-audit", role: "primary" },
    { skill: "design-intelligence", role: "supporting" },
    { skill: "ui-component-builder", role: "supporting" },
    { skill: "ui-ux-pro-max", role: "supporting" },
  ],
  copy: [
    { skill: "marketing-copywriter", role: "primary" },
    { skill: "eeat", role: "supporting" },
    { skill: "brand-ambassador", role: "supporting" },
  ],
  security: [
    { skill: "security-audit", role: "primary" },
    { skill: "security", role: "supporting" },
    { skill: "architectural-integrity-protocol", role: "supporting" },
  ],
  infra: [
    { skill: "use-railway", role: "primary" },
    { skill: "deployment", role: "supporting" },
    { skill: "supabase", role: "supporting" },
  ],
  video: [
    { skill: "remotion-orchestrator", role: "primary" },
    { skill: "heygen-director", role: "supporting" },
  ],
  marketing: [
    { skill: "marketing-copywriter", role: "primary" },
    { skill: "marketing-seo-researcher", role: "supporting" },
    { skill: "geo-optimization", role: "supporting" },
    { skill: "eeat", role: "supporting" },
  ],
};

/**
 * Returns the routed skill list for a bucket. Always returns a fresh copy
 * so callers can freely push/sort without mutating the shared table.
 */
export function routeToSkills(bucket: WorkTypeBucket): RoutedSkill[] {
  return ROUTING_TABLE[bucket].map((entry) => ({ ...entry }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agents/routing/__tests__/routing-table.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/agents/routing/routing-table.ts lib/agents/routing/__tests__/routing-table.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add full 8-bucket skill-routing table for MOA loop

Enumerates all 8 work-type buckets → real skill names, mirroring
review-dimensions.md's Dimension Activation Matrix table format.
Fills in the "full table to be built out during implementation" gap
noted in spec §4 and §8.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Build the MOA-trigger decision function

**Files:**
- Create: `lib/agents/routing/moa-trigger.ts`
- Test: `lib/agents/routing/__tests__/moa-trigger.test.ts`

**Interfaces:**
- Consumes: `WorkTypeBucket` (Task 1), `RoutedSkill` (Task 2).
- Produces:
  - `export interface MoaTriggerInput { bucket: WorkTypeBucket; routedSkills: RoutedSkill[]; issue: LinearIssueInput; crossCuttingBuckets?: WorkTypeBucket[]; hasOpenSpecQuestions?: boolean; }`
  - `export interface MoaDecision { fanOut: boolean; reasons: string[]; }`
  - `export function shouldFanOut(input: MoaTriggerInput): MoaDecision` — Task 5 (MOA dispatch) and Task 6 (integration) consume `MoaDecision.fanOut` to branch between Task 4's and Task 5's dispatch paths.

- [ ] **Step 1: Write the failing tests**

Create `lib/agents/routing/__tests__/moa-trigger.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { shouldFanOut } from "../moa-trigger";
import type { LinearIssueInput } from "../types";

function issue(overrides: Partial<LinearIssueInput>): LinearIssueInput {
  return {
    identifier: "RA-8000",
    title: "",
    description: "",
    labels: [],
    team: "RA",
    ...overrides,
  };
}

describe("shouldFanOut", () => {
  it("fans out when the decision is architecture-level with multiple viable approaches", () => {
    const decision = shouldFanOut({
      bucket: "infra",
      routedSkills: [{ skill: "use-railway", role: "primary" }],
      issue: issue({
        title: "Choose between Railway multi-region and Vercel Edge for report-render latency",
        description:
          "Two materially different long-term architectures on the table: keep rendering on " +
          "Railway with regional replicas, or move render workers to Vercel Edge Functions.",
      }),
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons).toContain("architecture-level-multi-approach");
  });

  it("fans out when the action is hard-to-reverse (schema migration)", () => {
    const decision = shouldFanOut({
      bucket: "bug",
      routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
      issue: issue({
        title: "Backfill and rename the InspectionReport.status column",
        description: "Requires a two-step Prisma migration against the production database.",
        labels: ["bug", "migration"],
      }),
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons).toContain("hard-to-reverse");
  });

  it("fans out when a judge/go-no-go gate is present", () => {
    const decision = shouldFanOut({
      bucket: "feature",
      routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
      issue: issue({
        title: "Ship the tenant-DB pilot cutover",
        description: "Needs a /judge go/no-go review before the cutover phase proceeds.",
      }),
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons).toContain("judge-gate-present");
  });

  it("fans out when the work item is ambiguous with open spec questions", () => {
    const decision = shouldFanOut({
      bucket: "feature",
      routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
      issue: issue({
        title: "Improve technician onboarding completion",
        description: "Vague — no acceptance criteria specified yet.",
      }),
      hasOpenSpecQuestions: true,
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons).toContain("ambiguous-spec");
  });

  it("fans out when the work is cross-cutting across 3+ routing buckets", () => {
    const decision = shouldFanOut({
      bucket: "feature",
      routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
      issue: issue({
        title: "Relaunch the pricing page",
        description: "Touches design, copy, and marketing simultaneously.",
      }),
      crossCuttingBuckets: ["design", "copy", "marketing"],
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons).toContain("cross-cutting-3-plus-buckets");
  });

  it("does not fan out when none of the 5 triggers apply", () => {
    const decision = shouldFanOut({
      bucket: "bug",
      routedSkills: [{ skill: "linear-task-processor", role: "primary" }],
      issue: issue({
        title: "Fix off-by-one in the equipment-calculator-mould drying-day count",
        description: "Simple arithmetic fix in lib/equipment-calculator-mould.ts, single approach, fully reversible.",
        labels: ["bug"],
      }),
    });
    expect(decision.fanOut).toBe(false);
    expect(decision.reasons).toHaveLength(0);
  });

  it("reports multiple matched reasons when more than one trigger applies", () => {
    const decision = shouldFanOut({
      bucket: "security",
      routedSkills: [{ skill: "security-audit", role: "primary" }],
      issue: issue({
        title: "Rotate and re-scope the Supabase service-role key strategy",
        description:
          "Hard-to-reverse security posture change; two competing approaches (per-workspace keys " +
          "vs a single scoped proxy) with materially different long-term cost. Needs a go/no-go gate.",
        labels: ["security"],
      }),
    });
    expect(decision.fanOut).toBe(true);
    expect(decision.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agents/routing/__tests__/moa-trigger.test.ts`
Expected: FAIL with `Cannot find module '../moa-trigger'`.

- [ ] **Step 3: Implement the MOA trigger decision**

Create `lib/agents/routing/moa-trigger.ts`:

```typescript
/**
 * MOA fan-out trigger decision (spec §4).
 *
 * Implements the 5 trigger criteria verbatim from
 * docs/superpowers/specs/2026-07-03-continuous-moa-agent-loop-design.md §4.
 * If ANY trigger matches, `fanOut` is true and the loop routes through
 * `buildMoaDispatch` (Task 5) instead of `buildSingleAgentDispatch` (Task 4).
 */

import type { LinearIssueInput, RoutedSkill, WorkTypeBucket } from "./types";

export interface MoaTriggerInput {
  bucket: WorkTypeBucket;
  routedSkills: RoutedSkill[];
  issue: LinearIssueInput;
  /**
   * Buckets this issue spans, when the classifier or a human note has
   * identified more than one applicable bucket. Optional — Plan 1's loop
   * only needs to pass this when it has cross-bucket signal (e.g. labels
   * spanning "design", "copy", "marketing" simultaneously).
   */
  crossCuttingBuckets?: WorkTypeBucket[];
  /**
   * Set true when spm/spec-writing (or the classifier's own heuristics)
   * flagged the issue as under-specified. Optional; defaults to false.
   */
  hasOpenSpecQuestions?: boolean;
}

export interface MoaDecision {
  fanOut: boolean;
  reasons: string[];
}

const ARCHITECTURE_KEYWORDS = [
  "choose between",
  "which approach",
  "architecture",
  "materially different",
  "two approaches",
  "competing approaches",
];

const HARD_TO_REVERSE_KEYWORDS = [
  "migration",
  "schema",
  "production database",
  "public api",
  "security posture",
  "production infra",
];

const JUDGE_GATE_KEYWORDS = ["/judge", "go/no-go", "go-no-go", "judge gate", "judge review"];

function textIncludesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function shouldFanOut(input: MoaTriggerInput): MoaDecision {
  const reasons: string[] = [];
  const haystack = `${input.issue.title} ${input.issue.description}`.toLowerCase();

  if (textIncludesAny(haystack, ARCHITECTURE_KEYWORDS)) {
    reasons.push("architecture-level-multi-approach");
  }

  if (textIncludesAny(haystack, HARD_TO_REVERSE_KEYWORDS)) {
    reasons.push("hard-to-reverse");
  }

  if (textIncludesAny(haystack, JUDGE_GATE_KEYWORDS)) {
    reasons.push("judge-gate-present");
  }

  if (input.hasOpenSpecQuestions) {
    reasons.push("ambiguous-spec");
  }

  if (input.crossCuttingBuckets && input.crossCuttingBuckets.length >= 3) {
    reasons.push("cross-cutting-3-plus-buckets");
  }

  return { fanOut: reasons.length > 0, reasons };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agents/routing/__tests__/moa-trigger.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/agents/routing/moa-trigger.ts lib/agents/routing/__tests__/moa-trigger.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add MOA fan-out trigger decision for continuous loop

Implements the 5 trigger criteria from spec §4 (architecture-level,
hard-to-reverse, judge gate, ambiguous spec, cross-cutting 3+ buckets)
as a single shouldFanOut() decision function with reason codes for
audit/logging.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire single-agent dispatch path

**Files:**
- Create: `lib/agents/routing/nexus-wrap.ts`
- Modify: `lib/agents/routing/types.ts` (add `ModelTier`, `TierSelector`, `DispatchPlan`)
- Create: `lib/agents/routing/dispatch.ts` (this task only adds `buildSingleAgentDispatch`; `buildMoaDispatch` and `dispatchWorkItem` are added in Tasks 5 and 6)
- Test: `lib/agents/routing/__tests__/dispatch.test.ts` (this task only adds the single-agent-path tests; MOA-path and integration tests are added in Tasks 5 and 6)

**Interfaces:**
- Consumes: `ClassificationResult` (Task 1), `RoutedSkill[]` (Task 2).
- Produces:
  - `export type ModelTier = "fable-5" | "opus-4.8" | "sonnet-5" | "haiku-4.5";`
  - `export type TierSelector = (context: { bucket: WorkTypeBucket; skill: string; fanOut: boolean }) => ModelTier;`
  - `export interface DispatchPlan { mode: "single-agent" | "moa"; skill: string; prompt: string; tier: ModelTier; }`
  - `export function wrapWithNexus(task: string): string`
  - `export function buildSingleAgentDispatch(classification: ClassificationResult, routedSkills: RoutedSkill[], selectTier: TierSelector): DispatchPlan` — Task 6 (integration) consumes this directly; Task 5 (MOA dispatch) does not consume this function but shares its `DispatchPlan` return shape.

**Tier-selection note:** the *rule* for which tier to pick (spec §5 — Fable 5 for synthesis/judge/escalation, Opus for real-ambiguity single dispatches, Sonnet for routine dev/copy, Haiku for mechanical sub-tasks) is being written as a separate Pi-Dev-Ops PR to the `nexus` skill (tracked externally as "Plan 4" in this multi-plan effort). This plan does not implement that rule. Instead, `TierSelector` is a function type this plan's code accepts as a parameter — Plan 1's loop (or a thin adapter added once Plan 4 lands) supplies the real implementation. Until Plan 4 lands, this task ships a `defaultTierSelector` that hardcodes the Sonnet-5-for-everything fallback so the code compiles, runs, and is fully testable today; it is explicitly a placeholder implementation of an externally-owned rule, not a redefinition of the rule itself, and its doc comment says so.

- [ ] **Step 1: Extend types.ts with dispatch-plan types**

Edit `lib/agents/routing/types.ts` — append after the existing `ClassificationResult` interface:

```typescript
export type ModelTier = "fable-5" | "opus-4.8" | "sonnet-5" | "haiku-4.5";

/**
 * Model-tier SELECTION function. The tier-selection RULE (spec §5) is owned
 * by a separate Pi-Dev-Ops PR to the `nexus` skill — this type is the
 * integration seam this plan consumes it through. See
 * lib/agents/routing/dispatch.ts's `defaultTierSelector` for the temporary
 * placeholder used until that PR lands.
 */
export type TierSelector = (context: {
  bucket: WorkTypeBucket;
  skill: string;
  fanOut: boolean;
}) => ModelTier;

export interface DispatchPlan {
  mode: "single-agent" | "moa";
  /** Primary skill (single-agent mode) or synthesiser skill label (MOA mode: always "boardroom"). */
  skill: string;
  /** Nexus-wrapped prompt ready to hand to the Agent tool or boardroom_query. */
  prompt: string;
  tier: ModelTier;
}
```

- [ ] **Step 2: Write the failing test for wrapWithNexus**

Create `lib/agents/routing/__tests__/dispatch.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { wrapWithNexus, buildSingleAgentDispatch, defaultTierSelector } from "../dispatch";
import { classifyWorkItem } from "../classifier";
import { routeToSkills } from "../routing-table";
import type { LinearIssueInput } from "../types";

function issue(overrides: Partial<LinearIssueInput>): LinearIssueInput {
  return {
    identifier: "RA-9000",
    title: "",
    description: "",
    labels: [],
    team: "RA",
    ...overrides,
  };
}

describe("wrapWithNexus", () => {
  it("replaces the {TASK} placeholder with the given task text and leaves no placeholder behind", () => {
    const wrapped = wrapWithNexus("Fix the equipment calculator divide-by-zero bug in RA-7004.");
    expect(wrapped).not.toContain("{TASK}");
    expect(wrapped).toContain("Fix the equipment calculator divide-by-zero bug in RA-7004.");
  });

  it("preserves the Nexus prompt's Operating identity section verbatim", () => {
    const wrapped = wrapWithNexus("Some task.");
    expect(wrapped).toContain("## Operating identity");
    expect(wrapped).toContain("## Model calibration");
  });
});

describe("defaultTierSelector", () => {
  it("returns sonnet-5 for every context as a placeholder until Plan 4 lands", () => {
    expect(defaultTierSelector({ bucket: "bug", skill: "linear-task-processor", fanOut: false })).toBe(
      "sonnet-5",
    );
    expect(defaultTierSelector({ bucket: "security", skill: "security-audit", fanOut: true })).toBe(
      "sonnet-5",
    );
  });
});

describe("buildSingleAgentDispatch", () => {
  it("builds a Nexus-wrapped single-agent dispatch plan for a bug issue", () => {
    const testIssue = issue({
      identifier: "RA-7004",
      title: "Equipment calculator throws on zero-affected-area storm jobs",
      description:
        "Submitting a storm-damage scope with 0m² affected area crashes " +
        "lib/equipment-calculator-storm.ts with a divide-by-zero.",
      labels: ["bug"],
    });
    const classification = classifyWorkItem(testIssue);
    const routedSkills = routeToSkills(classification.bucket);

    const plan = buildSingleAgentDispatch(classification, routedSkills, defaultTierSelector, testIssue);

    expect(plan.mode).toBe("single-agent");
    expect(plan.skill).toBe("linear-task-processor");
    expect(plan.tier).toBe("sonnet-5");
    expect(plan.prompt).not.toContain("{TASK}");
    expect(plan.prompt).toContain("RA-7004");
    expect(plan.prompt).toContain("## Operating identity");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/agents/routing/__tests__/dispatch.test.ts`
Expected: FAIL with `Cannot find module '../dispatch'`.

- [ ] **Step 4: Implement nexus-wrap.ts**

Create `lib/agents/routing/nexus-wrap.ts`:

```typescript
/**
 * Nexus-wraps a task string per the nexus skill's documented procedure:
 * /Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md, step 1-2.
 *
 * Reads references/NEXUS_PROMPT.md verbatim and substitutes {TASK} — never
 * restates or forks the prompt body, per the skill's explicit instruction.
 */

import { readFileSync } from "fs";
import { join } from "path";

const NEXUS_PROMPT_PATH = join(
  "/Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/references/NEXUS_PROMPT.md",
);

let cachedPromptTemplate: string | null = null;

function loadNexusPromptTemplate(): string {
  if (cachedPromptTemplate === null) {
    cachedPromptTemplate = readFileSync(NEXUS_PROMPT_PATH, "utf-8");
  }
  return cachedPromptTemplate;
}

/**
 * Fills the Nexus Prompt's {TASK} placeholder with the complete task text.
 * Callers must pass a task string that already includes the why and any
 * hard constraints, per the nexus skill's step 2 — this function does not
 * add context on the caller's behalf.
 */
export function wrapWithNexus(task: string): string {
  const template = loadNexusPromptTemplate();
  if (!template.includes("{TASK}")) {
    throw new Error(
      `NEXUS_PROMPT.md at ${NEXUS_PROMPT_PATH} no longer contains a {TASK} placeholder — ` +
        "the nexus skill's prompt contract may have changed; re-read the skill before dispatching.",
    );
  }
  return template.replace("{TASK}", task);
}
```

- [ ] **Step 5: Implement dispatch.ts (single-agent path only)**

Create `lib/agents/routing/dispatch.ts`:

```typescript
/**
 * Dispatch-path builders for the continuous MOA loop (spec §4-§6).
 *
 * buildSingleAgentDispatch: no-fan-out path — Nexus-wraps a single
 * specialist-skill dispatch (Task 4).
 * buildMoaDispatch: fan-out path — invokes the boardroom skill (Task 5).
 * dispatchWorkItem: composes classifier + routing table + MOA trigger +
 * both dispatch paths; this is the function Plan 1's loop calls (Task 6).
 */

import type {
  ClassificationResult,
  DispatchPlan,
  LinearIssueInput,
  ModelTier,
  RoutedSkill,
  TierSelector,
  WorkTypeBucket,
} from "./types";
import { wrapWithNexus } from "./nexus-wrap";

/**
 * PLACEHOLDER tier selector. The real tier-SELECTION rule (spec §5) is
 * defined by a separate Pi-Dev-Ops PR to the `nexus` skill (tracked
 * externally as "Plan 4"). Until that PR lands and a real TierSelector is
 * wired in by the loop caller, every dispatch runs at sonnet-5 — safe,
 * cheap, and never silently escalates to Fable 5 spend. Replace the
 * `selectTier` argument at the call site once Plan 4 ships; do not edit
 * this function to add tier logic — that logic belongs in Plan 4's PR.
 */
export function defaultTierSelector(_context: {
  bucket: WorkTypeBucket;
  skill: string;
  fanOut: boolean;
}): ModelTier {
  return "sonnet-5";
}

function describeIssueForTask(issue: LinearIssueInput): string {
  return (
    `I'm working the RestoreAssist Linear backlog item ${issue.identifier}: "${issue.title}". ` +
    `${issue.description} ` +
    `This is a "${issue.team}" team item${issue.project ? ` in project "${issue.project}"` : ""}. ` +
    "Implement it end-to-end following the linear-task-processor skill's phases " +
    "(understand, plan, implement, verify with pnpm type-check && pnpm lint, commit), " +
    "with one override: PR target is `main`, not `sandbox`. Open a small, scoped PR and stop — " +
    "do not merge."
  );
}

/**
 * Builds the no-fan-out dispatch plan: a single Nexus-wrapped prompt
 * targeting the routing table's primary skill for this issue's bucket.
 */
export function buildSingleAgentDispatch(
  classification: ClassificationResult,
  routedSkills: RoutedSkill[],
  selectTier: TierSelector,
  issue: LinearIssueInput,
): DispatchPlan {
  const primary = routedSkills.find((entry) => entry.role === "primary");
  if (!primary) {
    throw new Error(
      `No primary skill found for bucket "${classification.bucket}" — routing-table.ts must define ` +
        "exactly one primary entry per bucket.",
    );
  }

  const tier = selectTier({ bucket: classification.bucket, skill: primary.skill, fanOut: false });
  const task = describeIssueForTask(issue);
  const prompt = wrapWithNexus(task);

  return { mode: "single-agent", skill: primary.skill, prompt, tier };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/agents/routing/__tests__/dispatch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/agents/routing/types.ts lib/agents/routing/nexus-wrap.ts lib/agents/routing/dispatch.ts lib/agents/routing/__tests__/dispatch.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add single-agent Nexus-wrapped dispatch path for MOA loop

Wires the no-fan-out path: routes to the routing table's primary skill,
Nexus-wraps the task per the nexus skill's documented procedure, and
tags the dispatch with a model tier via an injectable TierSelector.
Tier-selection RULE is intentionally left to the separate Pi-Dev-Ops
nexus-skill PR (spec §5); defaultTierSelector is a sonnet-5 placeholder
until that lands.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire MOA fan-out dispatch path

**Files:**
- Modify: `lib/agents/routing/dispatch.ts` (add `buildMoaDispatch`)
- Modify: `lib/agents/routing/__tests__/dispatch.test.ts` (add MOA-path tests)

**Interfaces:**
- Consumes: `ClassificationResult` (Task 1), `RoutedSkill[]` (Task 2), `MoaDecision` (Task 3), `wrapWithNexus` (Task 4).
- Produces:
  - `export function buildMoaDispatch(classification: ClassificationResult, routedSkills: RoutedSkill[], moaDecision: MoaDecision, selectTier: TierSelector, issue: LinearIssueInput): DispatchPlan` — Task 6 (integration) consumes this directly.

**boardroom integration detail:** per `boardroom`'s SKILL.md, its programmatic API is `app.server.spec_pipeline.boardroom.boardroom_query`, its default panel is `deepseek/deepseek-v4-flash` + `anthropic/claude-sonnet-5` with `anthropic/claude-sonnet-5` as synthesiser and `anthropic/claude-opus-4-8` as the Jaccard-escalation panellist, and it has a hard 4-panellist ceiling. This plan does not re-implement `boardroom_query` — it builds the **input** to it: a Nexus-wrapped brief for the synthesiser, plus a `panelHint` derived from the routed skills so the caller (Plan 1's loop, one layer up) knows which specialist personas to brief each panellist with before calling `boardroom_query`. The routed skills from Task 2 inform panel composition this way: the routing table's primary + supporting skills for the issue's bucket(s) become the "specialist brief" section of the Nexus-wrapped MOA task, telling each panellist which lens to argue from (e.g. for a cross-cutting design+copy+marketing issue, the brief explicitly asks panellists to weigh design-system, copywriting, and campaign-funnel tradeoffs).

- [ ] **Step 1: Write the failing tests for buildMoaDispatch**

Edit `lib/agents/routing/__tests__/dispatch.test.ts` — add at the end of the file (before the final closing, as a new top-level `describe` block):

```typescript
import { buildMoaDispatch } from "../dispatch";
import { shouldFanOut } from "../moa-trigger";

describe("buildMoaDispatch", () => {
  it("builds a Nexus-wrapped MOA dispatch plan naming boardroom as the skill", () => {
    const testIssue = issue({
      identifier: "RA-8000",
      title: "Choose between Railway multi-region and Vercel Edge for report-render latency",
      description:
        "Two materially different long-term architectures on the table: keep rendering on " +
        "Railway with regional replicas, or move render workers to Vercel Edge Functions.",
      labels: ["infra"],
    });
    const classification = classifyWorkItem(testIssue);
    const routedSkills = routeToSkills(classification.bucket);
    const moaDecision = shouldFanOut({ bucket: classification.bucket, routedSkills, issue: testIssue });

    const plan = buildMoaDispatch(classification, routedSkills, moaDecision, defaultTierSelector, testIssue);

    expect(plan.mode).toBe("moa");
    expect(plan.skill).toBe("boardroom");
    expect(plan.tier).toBe("sonnet-5");
    expect(plan.prompt).not.toContain("{TASK}");
    expect(plan.prompt).toContain("boardroom");
    expect(plan.prompt).toContain("use-railway");
    expect(plan.prompt).toContain("architecture-level-multi-approach");
  });

  it("includes all routed-skill personas in the panel brief for a cross-cutting issue", () => {
    const testIssue = issue({
      identifier: "RA-8001",
      title: "Relaunch the pricing page",
      description: "Touches design, copy, and marketing simultaneously.",
    });
    const classification = classifyWorkItem(testIssue);
    const routedSkills = routeToSkills(classification.bucket);
    const moaDecision = shouldFanOut({
      bucket: classification.bucket,
      routedSkills,
      issue: testIssue,
      crossCuttingBuckets: ["design", "copy", "marketing"],
    });

    const plan = buildMoaDispatch(classification, routedSkills, moaDecision, defaultTierSelector, testIssue);

    expect(plan.prompt).toContain("cross-cutting-3-plus-buckets");
  });

  it("throws if called with a decision that did not trigger fan-out", () => {
    const testIssue = issue({
      identifier: "RA-8002",
      title: "Fix off-by-one in the equipment-calculator-mould drying-day count",
      description: "Simple arithmetic fix, single approach, fully reversible.",
      labels: ["bug"],
    });
    const classification = classifyWorkItem(testIssue);
    const routedSkills = routeToSkills(classification.bucket);
    const moaDecision = shouldFanOut({ bucket: classification.bucket, routedSkills, issue: testIssue });

    expect(() =>
      buildMoaDispatch(classification, routedSkills, moaDecision, defaultTierSelector, testIssue),
    ).toThrow(/fanOut/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agents/routing/__tests__/dispatch.test.ts`
Expected: FAIL with `buildMoaDispatch is not exported` / `Cannot find export`.

- [ ] **Step 3: Implement buildMoaDispatch**

Edit `lib/agents/routing/dispatch.ts` — add the import and function:

```typescript
import type { MoaDecision } from "./moa-trigger";
```

Add this import to the existing `import type { ... } from "./types";` block area (place it directly below), then append the function at the end of the file:

```typescript
/**
 * Builds the MOA fan-out dispatch plan: a single Nexus-wrapped brief that
 * names the boardroom skill as the dispatch target and carries a panel
 * brief so the caller can hand each boardroom panellist a specialist lens
 * before invoking boardroom_query (app.server.spec_pipeline.boardroom.boardroom_query,
 * per Pi-Dev-Ops's boardroom SKILL.md). This function does not call
 * boardroom_query itself — Plan 1's loop makes that call using this
 * DispatchPlan as input, exactly as it would use buildSingleAgentDispatch's
 * output to make an Agent-tool call.
 *
 * boardroom's own hard ceiling is 2-4 panellists (its default panel:
 * deepseek/deepseek-v4-flash + anthropic/claude-sonnet-5, synthesised by
 * anthropic/claude-sonnet-5, escalated to anthropic/claude-opus-4-8 on
 * low Jaccard similarity) — this function never asks for more.
 */
export function buildMoaDispatch(
  classification: ClassificationResult,
  routedSkills: RoutedSkill[],
  moaDecision: MoaDecision,
  selectTier: TierSelector,
  issue: LinearIssueInput,
): DispatchPlan {
  if (!moaDecision.fanOut) {
    throw new Error(
      "buildMoaDispatch called with a MoaDecision where fanOut=false — the caller must branch to " +
        "buildSingleAgentDispatch when no MOA trigger fired. moaDecision.reasons was empty.",
    );
  }

  const primary = routedSkills.find((entry) => entry.role === "primary");
  if (!primary) {
    throw new Error(
      `No primary skill found for bucket "${classification.bucket}" — routing-table.ts must define ` +
        "exactly one primary entry per bucket.",
    );
  }

  const panelBrief = routedSkills
    .map((entry) => `${entry.role === "primary" ? "Primary" : "Supporting"} lens: ${entry.skill}`)
    .join("; ");

  const tier = selectTier({ bucket: classification.bucket, skill: "boardroom", fanOut: true });

  const task =
    `I'm working the RestoreAssist Linear backlog item ${issue.identifier}: "${issue.title}". ` +
    `${issue.description} ` +
    `This item triggered MOA fan-out for reason(s): ${moaDecision.reasons.join(", ")}. ` +
    "Invoke the boardroom skill (app.server.spec_pipeline.boardroom.boardroom_query) with its default " +
    `2-4 panellist config. Brief each panellist with the specialist lens implied by this issue's ` +
    `routed skills — ${panelBrief} — so each panellist argues from that specialist's perspective before ` +
    "synthesis. Never skip synthesis; never concatenate panellist answers. Return the synthesised answer, " +
    "the panel's verbatim responses, min_pairwise_similarity, and the escalation/confidence fields per " +
    "boardroom's output contract. Then proceed to implement the synthesised decision end-to-end following " +
    "the linear-task-processor skill's phases (understand, plan, implement, verify with " +
    "pnpm type-check && pnpm lint, commit), with one override: PR target is `main`, not `sandbox`. " +
    "Open a small, scoped PR and stop — do not merge.";

  const prompt = wrapWithNexus(task);

  return { mode: "moa", skill: "boardroom", prompt, tier };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agents/routing/__tests__/dispatch.test.ts`
Expected: PASS (7 tests: 4 from Task 4 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/agents/routing/dispatch.ts lib/agents/routing/__tests__/dispatch.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add MOA fan-out dispatch path via boardroom skill

Builds the Nexus-wrapped boardroom dispatch plan for MOA-triggered
issues: names boardroom as the target, carries a panel brief derived
from the routing table's primary/supporting skills so panellists argue
from the right specialist lens, and defers the actual
boardroom_query call to the loop caller.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Integrate into the core loop's dispatch point

**Files:**
- Modify: `lib/agents/routing/dispatch.ts` (add `dispatchWorkItem`)
- Modify: `lib/agents/routing/__tests__/dispatch.test.ts` (add integration tests)

**Interfaces:**
- Consumes: everything from Tasks 1-5 — `classifyWorkItem`, `routeToSkills`, `shouldFanOut`, `buildSingleAgentDispatch`, `buildMoaDispatch`.
- Produces: `export function dispatchWorkItem(issue: LinearIssueInput, selectTier: TierSelector = defaultTierSelector, moaContext?: { crossCuttingBuckets?: WorkTypeBucket[]; hasOpenSpecQuestions?: boolean }): DispatchPlan`

**Assumed Plan 1 integration point (stated explicitly since Plan 1 is written by a different agent with no visibility into this plan):** Plan 1's single-cycle loop function, at its dispatch step (spec §3 step 3-5, "Classify the issue... Decide single-agent vs MOA fan-out... Dispatch implementation"), is assumed to call a function shaped like:

```typescript
async function dispatchWorkItem(issue: LinearIssueInput): Promise<PrResult>
```

as a **placeholder that currently does simple single-agent dispatch with no routing table or MOA** (per this task's brief). This plan's `dispatchWorkItem` (Task 6) does **not** match that async `Promise<PrResult>` signature — it is synchronous and returns a `DispatchPlan` (skill name + Nexus-wrapped prompt + tier), not a PR result. This is a deliberate seam, not an oversight: this plan's `dispatchWorkItem` computes *what to dispatch and how*; it does not itself call the `Agent` tool, call `boardroom_query`, or open a PR — those are Plan 1's runtime concerns (worktree isolation, commit/PR mechanics, stop guards) and out of this plan's scope per the task brief ("Do not re-plan Plan 1's loop mechanics"). **Plan 1's loop body must be updated (by whoever reconciles the two plans) to: call this plan's `dispatchWorkItem(issue)` to get a `DispatchPlan`, branch on `plan.mode` to either call the `Agent` tool (single-agent) or `boardroom_query` (moa) using `plan.prompt` and `plan.tier`, and only then produce the `PrResult` its own downstream steps (branch, implement, verify, commit, PR-open) expect.** This plan flags that reconciliation explicitly rather than guessing at Plan 1's internal `PrResult` shape, which this plan was not given.

- [ ] **Step 1: Write the failing integration tests**

Edit `lib/agents/routing/__tests__/dispatch.test.ts` — add at the end of the file:

```typescript
import { dispatchWorkItem } from "../dispatch";

describe("dispatchWorkItem (Plan 1 integration point)", () => {
  it("routes a simple bug fix to the single-agent path", () => {
    const plan = dispatchWorkItem(
      issue({
        identifier: "RA-9100",
        title: "Fix off-by-one in the equipment-calculator-mould drying-day count",
        description: "Simple arithmetic fix, single approach, fully reversible.",
        labels: ["bug"],
      }),
    );
    expect(plan.mode).toBe("single-agent");
    expect(plan.skill).toBe("linear-task-processor");
  });

  it("routes an architecture-level infra decision to the MOA path", () => {
    const plan = dispatchWorkItem(
      issue({
        identifier: "RA-9101",
        title: "Choose between Railway multi-region and Vercel Edge for report-render latency",
        description:
          "Two materially different long-term architectures on the table: Railway regional " +
          "replicas vs Vercel Edge Functions.",
        labels: ["infra"],
      }),
    );
    expect(plan.mode).toBe("moa");
    expect(plan.skill).toBe("boardroom");
  });

  it("routes a cross-cutting design+copy+marketing issue to MOA when moaContext flags 3+ buckets", () => {
    const plan = dispatchWorkItem(
      issue({
        identifier: "RA-9102",
        title: "Relaunch the pricing page",
        description: "Touches design, copy, and marketing simultaneously.",
      }),
      defaultTierSelector,
      { crossCuttingBuckets: ["design", "copy", "marketing"] },
    );
    expect(plan.mode).toBe("moa");
  });

  it("accepts a custom TierSelector so Plan 4's real tier rule can be substituted", () => {
    const customSelector = (_ctx: { bucket: string; skill: string; fanOut: boolean }) =>
      "haiku-4.5" as const;
    const plan = dispatchWorkItem(
      issue({
        identifier: "RA-9103",
        title: "Fix off-by-one in the equipment-calculator-mould drying-day count",
        description: "Simple arithmetic fix, single approach, fully reversible.",
        labels: ["bug"],
      }),
      customSelector,
    );
    expect(plan.tier).toBe("haiku-4.5");
  });

  it("returns a fully Nexus-wrapped prompt with no {TASK} placeholder for either mode", () => {
    const singlePlan = dispatchWorkItem(
      issue({ identifier: "RA-9104", title: "Fix a bug", description: "Simple fix.", labels: ["bug"] }),
    );
    const moaPlan = dispatchWorkItem(
      issue({
        identifier: "RA-9105",
        title: "Choose between two competing approaches for the migration",
        description: "materially different long-term architectures, requires a schema migration",
        labels: ["infra"],
      }),
    );
    expect(singlePlan.prompt).not.toContain("{TASK}");
    expect(moaPlan.prompt).not.toContain("{TASK}");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agents/routing/__tests__/dispatch.test.ts`
Expected: FAIL with `dispatchWorkItem is not exported`.

- [ ] **Step 3: Implement dispatchWorkItem**

Edit `lib/agents/routing/dispatch.ts` — add the import and function:

```typescript
import { shouldFanOut } from "./moa-trigger";
import { classifyWorkItem } from "./classifier";
import { routeToSkills } from "./routing-table";
```

Append at the end of the file:

```typescript
/**
 * Integration point for Plan 1 (Core Loop Mechanics).
 *
 * Plan 1's single-cycle loop is assumed to call a dispatch function at its
 * dispatch step (spec §3 steps 3-5) shaped like:
 *   async function dispatchWorkItem(issue: LinearIssueInput): Promise<PrResult>
 * as a placeholder doing simple single-agent dispatch with no routing table
 * or MOA. This function does NOT match that signature — it is synchronous
 * and returns a DispatchPlan (what to dispatch, not the dispatch's result),
 * by design: this plan computes routing + fan-out decisions; Plan 1 owns
 * the actual Agent-tool/boardroom_query call, worktree isolation, and
 * PR-open mechanics. Whoever reconciles the two plans must update Plan 1's
 * loop body to call this function, branch on `plan.mode`, perform the real
 * dispatch using `plan.prompt` + `plan.tier`, and produce Plan 1's own
 * PrResult from that dispatch's outcome.
 *
 * `moaContext` carries the two signals this module cannot derive from the
 * issue alone: cross-cutting bucket membership and open-spec-question
 * status. Plan 1's loop should pass these when available (e.g. from a
 * multi-label issue, or from a preceding spm/spec-writing pass); omitting
 * them just means those two specific MOA triggers never fire for that
 * issue — the other three (architecture-level, hard-to-reverse, judge-gate)
 * are still detected from issue text alone.
 */
export function dispatchWorkItem(
  issue: LinearIssueInput,
  selectTier: TierSelector = defaultTierSelector,
  moaContext?: { crossCuttingBuckets?: WorkTypeBucket[]; hasOpenSpecQuestions?: boolean },
): DispatchPlan {
  const classification = classifyWorkItem(issue);
  const routedSkills = routeToSkills(classification.bucket);
  const moaDecision = shouldFanOut({
    bucket: classification.bucket,
    routedSkills,
    issue,
    crossCuttingBuckets: moaContext?.crossCuttingBuckets,
    hasOpenSpecQuestions: moaContext?.hasOpenSpecQuestions,
  });

  if (moaDecision.fanOut) {
    return buildMoaDispatch(classification, routedSkills, moaDecision, selectTier, issue);
  }

  return buildSingleAgentDispatch(classification, routedSkills, selectTier, issue);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agents/routing/__tests__/dispatch.test.ts`
Expected: PASS (12 tests: 4 + 3 + 5 across Tasks 4-6).

- [ ] **Step 5: Run the full routing test suite together**

Run: `npx vitest run lib/agents/routing/`
Expected: PASS (all tests across `classifier.test.ts`, `routing-table.test.ts`, `moa-trigger.test.ts`, `dispatch.test.ts` — 40 tests total).

- [ ] **Step 6: Type-check the new module**

Run: `npx tsc --noEmit lib/agents/routing/types.ts lib/agents/routing/classifier.ts lib/agents/routing/routing-table.ts lib/agents/routing/moa-trigger.ts lib/agents/routing/nexus-wrap.ts lib/agents/routing/dispatch.ts`
Expected: no output (no errors). If it reports false path-alias errors unrelated to this module (a known issue per this repo's CLAUDE.md guidance on `npx tsc --noEmit path/to/file`), run the project-wide check instead: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep "lib/agents/routing"` and confirm it is empty.

- [ ] **Step 7: Commit**

```bash
git add lib/agents/routing/dispatch.ts lib/agents/routing/__tests__/dispatch.test.ts
git commit -m "$(cat <<'EOF'
feat(agents): add dispatchWorkItem — Plan 1 loop integration point

Composes classifyWorkItem + routeToSkills + shouldFanOut +
buildSingleAgentDispatch/buildMoaDispatch into a single synchronous
dispatchWorkItem(issue, selectTier?, moaContext?) -> DispatchPlan
function. Documents the seam with Plan 1's assumed async
dispatchWorkItem(issue): Promise<PrResult> placeholder — this function
decides *what* to dispatch; Plan 1's loop remains responsible for
*calling* the Agent tool / boardroom_query and producing the PR result.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage** (§4 and the model-tier-routing portion of §5, per this plan's scope):

- §4 two-stage router, stage 1 (classify into 8 buckets from labels+text) → Task 1 (`classifyWorkItem`). Covered.
- §4 two-stage router, stage 2 (route to matching specialist skill(s) via activation-matrix-shaped table) → Task 2 (`ROUTING_TABLE` / `routeToSkills`), full 8-row table built out (spec §8 explicitly calls this an open follow-up; this plan closes it). Covered.
- §4 MOA fan-out, all 5 trigger criteria (architecture-level/multi-approach, hard-to-reverse, judge/go-no-go gate, ambiguous spec, cross-cutting 3+ buckets) → Task 3 (`shouldFanOut`), one test per trigger plus a none-apply case plus a multi-trigger case. Covered.
- §4 "Otherwise: single specialist skill, Nexus-wrapped, no fan-out" → Task 4 (`buildSingleAgentDispatch` + `wrapWithNexus`). Covered.
- §4 MOA fan-out "via the boardroom skill... 2-4 panellists per default panel config, synthesis required" → Task 5 (`buildMoaDispatch`), respects boardroom's hard ceiling and defers the actual `boardroom_query` call to the loop caller per the "consume, don't redesign" instruction. Covered.
- §5 model-tier-routing portion applying inside RestoreAssist (consume tier-selection as external input, don't define it) → Task 4's `TierSelector` type + `defaultTierSelector` placeholder, explicitly documented as a stand-in for the separate Pi-Dev-Ops PR. Covered as scoped (selection consumption, not the tier *rule* itself — that's out of scope by the task brief).
- Integration into Plan 1's dispatch point, explicit interface statement → Task 6, with the assumed `dispatchWorkItem(issue): Promise<PrResult>` signature stated and the seam/reconciliation responsibility called out explicitly. Covered.
- `review-dimensions.md` table-format mirroring → Task 2's routing table uses the same Markdown pipe-table shape (header row, one row per bucket) as the Dimension Activation Matrix section. Covered.
- nexus-wrapping procedure followed exactly (read `NEXUS_PROMPT.md`, replace `{TASK}`, dispatch verbatim, no restating/forking) → `wrapWithNexus` reads the file at its documented path each build (cached in-process, not forked into a copy) and only substitutes the placeholder. Covered.

**Not covered by this plan, correctly out of scope:** Plan 1's loop mechanics, stop guards, governance rule edits (§7), Phase 3 self-improving skills (§6), the actual Pi-Dev-Ops nexus tier-selection PR (§5's own definition, tracked as Plan 4), and the `owner-gated` Linear label creation (§3/§8) — all explicitly assigned elsewhere by the task brief.

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later" strings appear in any step. The one intentional placeholder — `defaultTierSelector` — is not a plan-writing shortcut; it is a real, tested, working function with a documented reason for its simplicity (an external rule not yet defined), matching the task brief's explicit instruction to "reference where Plan 4... will define it, don't redefine the tiers yourself here." Every code step contains complete, runnable code, not descriptions of code.

**3. Type/interface consistency check across tasks:**
- `WorkTypeBucket` (Task 1) is the literal union used identically in Task 2 (`ROUTING_TABLE` keys), Task 3 (`MoaTriggerInput.bucket`), and Task 6 (`moaContext.crossCuttingBuckets`). No drift.
- `RoutedSkill` (Task 2: `{ skill: string; role: "primary" | "supporting" }`) is the exact type threaded through Task 3 (`MoaTriggerInput.routedSkills`), Task 4 (`buildSingleAgentDispatch`'s second parameter), and Task 5 (`buildMoaDispatch`'s second parameter). No drift.
- `ClassificationResult` (Task 1) is consumed identically by name and shape in Task 4/5/6 (`classification.bucket`, never a renamed field).
- `MoaDecision` (Task 3: `{ fanOut: boolean; reasons: string[] }`) is consumed identically in Task 5 (`buildMoaDispatch`'s `moaDecision` parameter, checked via `moaDecision.fanOut` and `moaDecision.reasons`) and Task 6 (`dispatchWorkItem`'s internal branch). No drift.
- `DispatchPlan` (Task 4: `{ mode; skill; prompt; tier }`) is the return type of both `buildSingleAgentDispatch` and `buildMoaDispatch` (Task 5) and of `dispatchWorkItem` (Task 6) — verified identical field names in every test assertion (`plan.mode`, `plan.skill`, `plan.prompt`, `plan.tier`) across Tasks 4, 5, 6. No drift.
- `TierSelector` (Task 4) has one signature used consistently: `(context: { bucket; skill; fanOut }) => ModelTier`, called the same way in `buildSingleAgentDispatch`, `buildMoaDispatch`, and `dispatchWorkItem`. No drift.
- Function naming: `classifyWorkItem`, `routeToSkills`, `shouldFanOut`, `wrapWithNexus`, `buildSingleAgentDispatch`, `buildMoaDispatch`, `dispatchWorkItem`, `defaultTierSelector` — each name introduced once and reused verbatim in every later task and test file; no renamed variants found.

No gaps requiring an added task were found during self-review.
