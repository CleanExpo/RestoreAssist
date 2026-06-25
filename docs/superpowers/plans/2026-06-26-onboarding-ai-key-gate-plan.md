# Onboarding AI-Key Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Spec:** `docs/superpowers/specs/2026-06-26-onboarding-ai-key-gate.md`.

**Goal:** Make installing an AI key (Anthropic **or** OpenAI) the mandatory first step of onboarding, gate activation on a working key, route AI report generation by whichever provider the client installed, fix the wrong-link/enum defects, and rework the onboarding videos to front-load the key (intro + a new "how to get your key" video).

**Architecture:** Three layers change together — the setup **gate** (`lib/setup/checks.ts`) goes from optional to required on `{ANTHROPIC, OPENAI}`; the **report router** stops hard-coding Anthropic and dispatches by the client's installed provider; the **wizard + videos** present the key as step 1. Provider keys already live encrypted in `ProviderConnection` (AES-256-GCM) and validate via a live API ping (`validateProviderKey`) — we reuse both.

**Tech Stack:** Next.js 15 App Router, Prisma, Vitest 4.1.6 + @testing-library/react, Remotion 4.0.471, ElevenLabs (one voice), Cloudinary.

## Global Constraints

- **Operate iff ≥1 `ACTIVE` `ProviderConnection` with `provider ∈ {ANTHROPIC, OPENAI}`.** Gemini/Gemma do not satisfy it. Mandatory for everyone — no trial exception.
- **Never leak `error.message` to clients** (CLAUDE.md); response shapes `{ data }`/`{ error }`; try/catch on routes; `escapeHtml` for user HTML; **don't fabricate APIs — read the file before editing.**
- **AI-key page is `/dashboard/settings/ai-providers`** (NOT `/dashboard/integrations`).
- **`ProviderConnectionStatus` enum (schema) = `ACTIVE | FAILED | DISABLED`** — code must not write `"ERROR"`.
- Test runner: `pnpm exec vitest run <file>`. Single-file type smoke: `pnpm exec tsc --noEmit <file>` (ignore project-wide alias errors).
- Commit per task, conventional-commit, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Read-before-edit is mandatory** for every code task: the exact current lines must be confirmed before writing the test, because line numbers below are from a prior investigation and may have drifted.

---

# TRACK A — Code (gate, routing, fixes, wizard)

### Task 1: Fix the `ProviderConnectionStatus` enum mismatch (defect #3)

**Files:** Modify `lib/workspace/provider-connections.ts`; Modify `lib/setup/checks.ts`; Test `lib/workspace/__tests__/provider-connections.status.test.ts`.

**Context:** `validateProviderKey` (and `byokKeysCheck`) write `status: "ERROR"`, but `prisma/schema.prisma` `enum ProviderConnectionStatus` only has `ACTIVE | FAILED | DISABLED`. A failed validation throws at the DB layer.

- [ ] **Step 1: Read** both files; confirm every literal `"ERROR"` written to a `status` field (grep `status:\s*"ERROR"` and the `as any` cast in `validateProviderKey`).
- [ ] **Step 2: Write the failing test** — assert that the value `validateProviderKey` persists on failure is one of the schema enum members. Since it hits Prisma, test the pure mapping instead: extract a tiny helper `failureStatus(): "FAILED"` (or assert the literal in the source via a unit that imports the module and checks no `"ERROR"` remains is brittle) — prefer extracting the status constant:

```ts
// lib/workspace/__tests__/provider-connections.status.test.ts
import { describe, it, expect } from "vitest";
import { CONNECTION_FAILED_STATUS } from "../provider-connections";
describe("ProviderConnection failure status", () => {
  it("uses a schema-valid enum member", () => {
    expect(CONNECTION_FAILED_STATUS).toBe("FAILED");
  });
});
```

- [ ] **Step 3: Run RED** — `pnpm exec vitest run lib/workspace/__tests__/provider-connections.status.test.ts` (fails: export missing).
- [ ] **Step 4: Implement** — add `export const CONNECTION_FAILED_STATUS = "FAILED" as const;` and replace every `"ERROR"` status write in `provider-connections.ts` and `checks.ts` with `CONNECTION_FAILED_STATUS` (drop the `as any` cast). Confirm `grep -n '"ERROR"' lib/workspace/provider-connections.ts lib/setup/checks.ts` returns nothing.
- [ ] **Step 5: Run GREEN**, then commit: `fix(byok): persist FAILED (not ERROR) on provider-key validation failure`.

---

### Task 2: Make the operating-key check required (gate change, defect #2 / spec §4.1)

**Files:** Modify `lib/setup/checks.ts`; Test `lib/setup/__tests__/byok-gate.test.ts`.

**Context:** `byokKeysCheck` returns `status: "yellow"` when zero active connections. Spec requires RED when zero of {ANTHROPIC, OPENAI} are active.

- [ ] **Step 1: Read** `byokKeysCheck` and the docstring REQUIRED/OPTIONAL lists in `lib/setup/checks.ts`. Confirm it calls `listProviderConnections(workspace.id)` and inspects `status === "ACTIVE"`.
- [ ] **Step 2: Write the failing test** (mock `listProviderConnections` + the workspace lookup):

```ts
// lib/setup/__tests__/byok-gate.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(async () => ({ id: "ws1", name: "WS" })),
  listProviderConnections: vi.fn(),
}));
import { listProviderConnections } from "@/lib/workspace/provider-connections";
import { byokKeysCheck } from "../checks"; // export it if not already

const c = (provider: string, status = "ACTIVE") => ({ provider, status, maskedKey: "x" });

describe("byokKeysCheck — operating key required", () => {
  it("RED when zero Anthropic/OpenAI keys", async () => {
    (listProviderConnections as any).mockResolvedValue([]);
    expect((await byokKeysCheck("org1")).status).toBe("red");
  });
  it("GREEN with one active Anthropic key", async () => {
    (listProviderConnections as any).mockResolvedValue([c("ANTHROPIC")]);
    expect((await byokKeysCheck("org1")).status).toBe("green");
  });
  it("GREEN with one active OpenAI key", async () => {
    (listProviderConnections as any).mockResolvedValue([c("OPENAI")]);
    expect((await byokKeysCheck("org1")).status).toBe("green");
  });
  it("RED when only Gemini/Gemma present (not operating providers)", async () => {
    (listProviderConnections as any).mockResolvedValue([c("GOOGLE"), c("GEMMA")]);
    expect((await byokKeysCheck("org1")).status).toBe("red");
  });
});
```

- [ ] **Step 3: Run RED.**
- [ ] **Step 4: Implement** — in `byokKeysCheck`, compute `const operating = connections.filter(c => c.status === "ACTIVE" && (c.provider === "ANTHROPIC" || c.provider === "OPENAI"));` and return `status: operating.length > 0 ? "green" : "red"` with note `"Add your Anthropic or OpenAI API key to operate RestoreAssist."`. Move the capability from the OPTIONAL list to the REQUIRED list in the docstring. Rename the `ai_generation` check's `label` (e.g. `"System AI service (Gemma)"`) so it isn't mistaken for the client's report key. Export `byokKeysCheck` if the test needs it.
- [ ] **Step 5: Run GREEN**, then commit: `feat(setup): require an Anthropic or OpenAI key to activate (gate RED when missing)`.

---

### Task 3: Provider-agnostic report routing (spec §4.2)

**Files:** Modify `app/api/reports/generate-inspection-report/route.ts` (+ any sibling that calls `getAnthropicApiKey`); Test `app/api/reports/__tests__/report-provider-routing.test.ts`.

**Context:** the route currently does `getLatestAIIntegration` → else `getAnthropicApiKey` (Anthropic-only). An OpenAI-only client passes the new gate but the report 400s. Route by installed provider via the existing BYOK dispatch.

- [ ] **Step 1: Read** the key-acquisition block (the `if (!aiIntegration) { … getAnthropicApiKey … }` branch), plus `lib/ai-provider.ts` `callAIProvider` and `lib/workspace/provider-connections.ts` `getProviderApiKey`/`listProviderConnections`. Confirm the exact dispatch signature before writing code.
- [ ] **Step 2: Write the failing test** — a resolver `resolveReportProvider(workspaceId)` that returns `{ provider, apiKey }` choosing Anthropic if active, else OpenAI:

```ts
// app/api/reports/__tests__/report-provider-routing.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/workspace/provider-connections", () => ({
  listProviderConnections: vi.fn(),
  getProviderApiKey: vi.fn(async (_ws: string, p: string) => `key-${p}`),
}));
import { listProviderConnections } from "@/lib/workspace/provider-connections";
import { resolveReportProvider } from "../generate-inspection-report/provider";

describe("resolveReportProvider", () => {
  it("prefers Anthropic when both present", async () => {
    (listProviderConnections as any).mockResolvedValue([
      { provider: "OPENAI", status: "ACTIVE" }, { provider: "ANTHROPIC", status: "ACTIVE" },
    ]);
    expect((await resolveReportProvider("ws1")).provider).toBe("ANTHROPIC");
  });
  it("uses OpenAI when only OpenAI is active", async () => {
    (listProviderConnections as any).mockResolvedValue([{ provider: "OPENAI", status: "ACTIVE" }]);
    const r = await resolveReportProvider("ws1");
    expect(r.provider).toBe("OPENAI");
    expect(r.apiKey).toBe("key-OPENAI");
  });
  it("throws when neither is active", async () => {
    (listProviderConnections as any).mockResolvedValue([]);
    await expect(resolveReportProvider("ws1")).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run RED.**
- [ ] **Step 4: Implement** `app/api/reports/generate-inspection-report/provider.ts` exporting `resolveReportProvider`, then rewire the route to call it and dispatch via `callAIProvider({ provider, apiKey, … })` instead of the Anthropic-only path. Keep the platform env key only as a last-resort ops fallback. On failure return `{ error: "No working AI provider key. Add an Anthropic or OpenAI key in Settings → AI Providers." }` (no `err.message`).
- [ ] **Step 5: Run GREEN**, then commit: `feat(reports): route generation by the client's installed provider (Anthropic or OpenAI)`.

> Repeat the rewire for `generate-enhanced`, `client-summary`, interview validation, and vision routes as follow-up commits if they hard-code `getAnthropicApiKey` — verify with `grep -rn getAnthropicApiKey app/api`.

---

### Task 4: Onboarding-status + signup link/copy (defect #1, spec §4.3/4.4)

**Files:** Modify `app/api/onboarding/status/route.ts`; Modify `app/signup/page.tsx`; Test `app/api/onboarding/__tests__/status-ai-provider.test.ts`.

- [ ] **Step 1: Read** the `ai_provider` step object in `status/route.ts` and the amber banner in `signup/page.tsx`.
- [ ] **Step 2: Write the failing test** — `ai_provider.required === true` for a trial user with no key, and `route === "/dashboard/settings/ai-providers"`:

```ts
// minimal: import the pure step-builder if extracted, else assert the route constant
import { describe, it, expect } from "vitest";
import { AI_PROVIDER_ROUTE } from "../status/route";
describe("onboarding ai_provider step", () => {
  it("points at the AI-providers page", () => {
    expect(AI_PROVIDER_ROUTE).toBe("/dashboard/settings/ai-providers");
  });
});
```

- [ ] **Step 3: Run RED.**
- [ ] **Step 4: Implement** — set `ai_provider.required = !hasKey` (independent of `isTrial`), `completed = hasKey`, `route = AI_PROVIDER_ROUTE` (export the constant). In `signup/page.tsx`, replace the "free trial uses our platform key — no setup needed" copy with "An Anthropic or OpenAI API key is required to operate RestoreAssist — you pay providers directly, at cost. Add it in Settings → AI Providers" and fix the link target.
- [ ] **Step 5: Run GREEN**, then commit: `fix(onboarding): AI key required up front; correct link to AI-providers page`.

---

### Task 5: Key-install wizard step (spec §4.5)

**Files:** Create `components/setup/AiKeyCard.tsx`; Modify `components/setup/SetupShell.tsx`; Test `components/setup/__tests__/AiKeyCard.test.tsx`.

- [ ] **Step 1: Read** `SetupShell.tsx` (card ordering, the `VideoExplainer` embed) and the AI-providers input pattern in `app/dashboard/settings/ai-providers/page.tsx` (provider list, masked input, `POST /api/workspace/provider-connections`, validate route).
- [ ] **Step 2: Write the failing component test** — `AiKeyCard` renders a provider selector (Anthropic/OpenAI), a masked key input, a Validate button, and an "either one is enough" hint; on a mocked successful validate it shows a connected state.
- [ ] **Step 3: Run RED.**
- [ ] **Step 4: Implement** `AiKeyCard` (reuse the providers page's save/validate calls; reuse `VideoExplainer` for both onboarding videos), and render it as the **first** child in `SetupShell` before `BusinessDetailsCard`.
- [ ] **Step 5: Run GREEN**, then commit: `feat(setup): AI-key install as the first wizard step`.

---

# TRACK B — Videos (rework intro + new how-to-get-key)

> Reuses the pipeline from `docs/superpowers/plans/2026-06-26-onboarding-welcome-video-production.md` and the `producing-restoreassist-videos` skill. Asset steps (ElevenLabs gen, Remotion render, Cloudinary upload) run on a host with creds + Chromium.

### Task 6: Rescript the welcome video to lead with the key

**Files:** Modify `content/videos/onboarding-welcome.script.json`; Modify `remotion/compositions/onboarding-welcome.tsx` (add a leading "Your AI key" scene; re-align timings); regenerate VTT.

- [ ] **Step 1:** update the transcript SSOT — new scene 1: *"Welcome to RestoreAssist. First, add an AI key — Anthropic or OpenAI. Either one powers your reports, photo analysis, and voice notes."* Keep business/brand/pricing after.
- [ ] **Step 2:** add the matching on-screen "Your AI key" scene to the composition; re-align frame windows; run the script-shape + VTT tests.
- [ ] **Step 3 [HOST]:** regenerate MP3 → render `OnboardingWelcome` → re-upload to Cloudinary → confirm 200.
- [ ] **Step 4:** commit code/transcript/VTT: `feat(video): rescript onboarding-welcome to lead with the AI key`.

### Task 7: New "How to get your API key" video

**Files:** Create `content/videos/get-api-key.script.json`; Create `remotion/compositions/get-api-key.tsx`; register in `remotion/index.tsx` + `remotion/render-all.ts`; add `remotion-get-api-key` to `video-registry.ts` + `caption-registry.ts`; embed in `AiKeyCard`.

- [ ] **Step 1:** transcript covering the Anthropic and OpenAI key-creation steps + the cost/usage acknowledgment + the value story (BYOK + on-device data → lower price), with figures from spec §7.
- [ ] **Step 2:** Remotion composition (brand-styled, scenes per provider + a cost scene); register it; add render-manifest entry; add registry + caption entries under slug `remotion-get-api-key`.
- [ ] **Step 3:** TDD the new transcript-shape + VTT.
- [ ] **Step 4 [HOST]:** generate MP3 → render → upload → confirm 200.
- [ ] **Step 5:** commit: `feat(video): add 'how to get your API key' onboarding video`.

---

### Task 8: End-to-end verification + review

- [ ] Run `pnpm exec vitest run lib/setup lib/workspace app/api/reports app/api/onboarding components/setup content/videos scripts/lib` — all green.
- [ ] **VERIFICATION CHECKLIST (in-app):** new client (Organization `setupCompletedAt = null`, zero keys) → wizard shows the **AI-key card first**; cannot activate until a valid Anthropic **or** OpenAI key is entered; both onboarding videos play (intro → how-to-get-key) with audio + captions; an OpenAI-only client generates a report successfully; every "add your key" link lands on `/dashboard/settings/ai-providers`. **Confirm**: "Does onboarding force a key first, do both videos play, and does a report work after?"
- [ ] Open PR via `pr-creator` → `/review-pr` (dimensions 1,2,4,5,6,9,13,18) → merge → `deployment-verifier`.

## Self-Review
- Spec coverage: gate (T2), routing (T3), enum (T1), link/copy (T4), wizard step (T5), two videos (T6/T7), cost/value copy (T4/T7), acceptance (T8). ✅
- Read-before-edit is mandated per task because the line numbers came from investigation, not a fresh read — this prevents fabricated edits.
- Open risk: OpenAI-consumer rewiring (transcription/embeddings on env key) is explicitly out of scope (spec §5) — an OpenAI-only client still gets reports/vision via BYOK, but voice/search use the platform env key until that fast-follow lands. Flag in the PR description.
