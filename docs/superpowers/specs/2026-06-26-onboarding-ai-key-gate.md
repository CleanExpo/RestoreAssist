# Onboarding AI-Key Gate — Corrected Spec

> **Status:** APPROVED direction (Phill, 2026-06-26). Supersedes the AI-key ordering in
> `docs/superpowers/plans/2026-06-26-onboarding-welcome-video-production.md`.
> Implementation plan: `docs/superpowers/plans/2026-06-26-onboarding-ai-key-gate-plan.md`.

## 1. Operating model (the corrected truth)

**To operate RestoreAssist, a client MUST install at least one AI key — Anthropic *or* OpenAI. Either one alone is sufficient. This is the mandatory first task; the system does not work until a key is installed. No trial exception.**

- **Anthropic** powers (verified runtime): AI report generation, damage **photo/vision analysis** (S500), interview validation, client summaries. *No fallback today — report generation throws without an Anthropic key.*
- **OpenAI** powers (verified runtime): voice-note **transcription** (Whisper / gpt-4o-transcribe), **job embeddings / "find similar past jobs"** semantic search (`text-embedding-3-small`), BYOK GPT vision (`gpt-5.4`). *Each currently degrades silently (Web Speech / hash embedding) if absent.*
- **Later / optional / add-ons:** Google·Gemini (BYOK-wired, no platform calls), self-hosted Gemma (basic-tier system fallback), accounting/Drive integrations. The provider layer is extensible for current + upcoming add-ons.

**Gate rule:** onboarding/activation is satisfied iff there is **≥1 `ACTIVE` (live-validated) `ProviderConnection` where `provider ∈ {ANTHROPIC, OPENAI}`.** A Gemini-only or Gemma-only workspace does **not** satisfy it.

## 2. Current behaviour vs. required behaviour (the gap)

| Concern | Current (verified) | Required |
| --- | --- | --- |
| Setup gate for the operating key | `byok_keys` check is **YELLOW/optional**; note "add for premium models". Zero keys ⇒ still activates. | **RED/blocking** when zero of {Anthropic, OpenAI} are active+valid. |
| What "AI works" check tests | `ai_generation` (RED) pings **system Gemma** only — never the client's report key. | Keep Gemma health as a system check; **add a required check** that the client has a working Anthropic/OpenAI key. |
| Report routing | `generate-inspection-report` (+ siblings) call **`getAnthropicApiKey` (Anthropic-only)** → an OpenAI-only client passes the gate but reports still 400. | Route by **whichever provider the client installed** (BYOK dispatch via `callAIProvider`/`workspaceByokDispatch`). |
| Trial behaviour | PR #1391: trial/free users run on the platform env key; signup says "no setup needed". | **Client key required up front for everyone.** Platform env key = ops safety-net only, not surfaced as the client path. Signup copy corrected. |
| Where users add the key | Signup + onboarding-status say **"Settings → Integrations"** (`/dashboard/integrations` = Xero/MYOB). Actual page is **`/dashboard/settings/ai-providers`**. | Link/route users to the real AI-providers page everywhere; surface it as wizard step 1. |
| Validation status enum | Schema `ProviderConnectionStatus` = `ACTIVE \| FAILED \| DISABLED`; code writes **`"ERROR"`**. | Reconcile to one value (recommend `FAILED` in code to match schema). |
| Onboarding order | Wizard = business → brand → pricing → activate. **No key step.** Welcome video never mentions a key. | **Key install is step 1**, then business → brand → pricing → activate. Video leads with the key + a second "how to get your key" video. |

## 3. Required onboarding flow

1. **Install an AI key — Anthropic *or* OpenAI** (required, gating; live-validated). One valid key of the two unlocks the rest.
2. Business details (ABN → ABR hydration)
3. Branding (logo / colours)
4. Pricing (labour rates + admin fee)
5. **Activate** → workspace live (only reachable once steps 1–4 pass)
6. *(Optional/later, surfaced but non-blocking: Google·Gemini, accounting/Drive integrations, add-ons.)*

## 4. Functional requirements & touch points (design-level)

### 4.1 Setup gate — `lib/setup/checks.ts`
- Repurpose `byok_keys` (or add `operating_ai_key`) as **required (RED-when-unmet)**: GREEN iff ≥1 `ACTIVE` connection with `provider ∈ {ANTHROPIC, OPENAI}`; RED otherwise, note *"Add your Anthropic or OpenAI API key to operate RestoreAssist."*
- Move the operating key from the OPTIONAL list to the REQUIRED list in the docstring.
- Keep `ai_generation` (Gemma) but rename its label so it isn't mistaken for the client's report key.
- Fix the `"ERROR"` vs `FAILED` enum write in `validateProviderKey` and `byokKeysCheck`.

### 4.2 Report routing — provider-agnostic
- Replace the Anthropic-only `getAnthropicApiKey` acquisition in `app/api/reports/generate-inspection-report/route.ts` (and `generate-enhanced`, `client-summary`, interview validation, vision) with a resolver: read the workspace's active provider connections → pick Anthropic if present, else OpenAI → dispatch via `callAIProvider`/`workspaceByokDispatch`. Platform env key only as ops fallback (the gate prevents a keyless state).
- Acceptance: an **OpenAI-only** client and an **Anthropic-only** client can each generate a full report.

### 4.3 Onboarding status — `app/api/onboarding/status/route.ts`
- `ai_provider` step: `completed` iff ≥1 active Anthropic/OpenAI connection; `required: true` (for everyone, not just non-trial); `route: "/dashboard/settings/ai-providers"`. Title/description say "Anthropic or OpenAI".

### 4.4 Signup messaging — `app/signup/page.tsx`
- Replace "your free trial uses our platform key — no setup needed" with: a key (Anthropic **or** OpenAI) is required to operate, and how the cost model works (§7). Correct the destination to the AI-providers page.

### 4.5 Wizard UI — `components/setup/*`
- Add the key step as the **first** card in `SetupShell` (before `BusinessDetailsCard`): provider choice (Anthropic / OpenAI), masked key input, live-validate button, "either one is enough" hint, and a link/embed to the "how to get your key" video. Saves via `POST /api/workspace/provider-connections`; validates via the validate route. Activation blocked until valid.

### 4.6 Onboarding videos — TWO videos, in order
- **Video 1 — Welcome/intro** (`remotion-onboarding-welcome`, already built): **rescript** to lead with the key. The produced MP3/MP4 (old business→brand→pricing script) must be **regenerated** via the pipeline.
- **Video 2 — NEW: "How to get your API key"** (new slug, e.g. `remotion-get-api-key`): a screen-walk of the Anthropic and OpenAI key-creation steps (§6 of the plan), **explicitly acknowledging usage + cost** (§7) and the value story (BYOK + on-device data ownership → lower software price). Shown right after Video 1 on the key step.

## 5. Out of scope (fast-follows)
- **OpenAI-consumer rewiring:** transcription (`/app/api/ai/voice-note-transcribe`) and embeddings (`lib/ai/embeddings.ts`, `lib/rag/embed.ts`) read `process.env.OPENAI_API_KEY` directly — not the client's BYOK OpenAI key. For an OpenAI-only client to get transcription/semantic-search on their own key, rewire to the BYOK store. Not required for the operate-on-either-key gate.
- Gemini/Google as an operating option, and the add-on framework.

## 6. (Resolved) — see §1: client key mandatory for everyone, no trial exception.

## 7. Cost & usage facts for the onboarding copy (pulled from developer docs, 2026-06-26)

**Anthropic** — per 1M tokens (platform.claude.com/pricing): Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15, Opus 4.8 $5/$25 (input/output). Pay-per-token; ~$5 minimum credit; keys `sk-ant-…`.
**OpenAI** — (developers.openai.com/api/docs/pricing): GPT-5.4 $2.50/$15, GPT-5.4-mini $0.75/$4.50 per 1M; audio transcription ~$0.006/min; embeddings fractions of a cent per thousand records.

**Grounded estimate for copy:** a full S500 report ≈ **$0.05–0.50** (Haiku→Opus); a voice note ≈ **half a cent/min**; semantic search negligible. Frame as estimates; live figures are on each provider's dashboard.

**Key-creation steps (for Video 2):**
- *Anthropic:* console.anthropic.com → Settings → Billing (add card, min $5) → Settings → API keys → Create Key → copy `sk-ant-…` (shown once).
- *OpenAI:* platform.openai.com (verify email/phone) → API keys → Create new secret key → copy (shown once) → Settings → Billing → add payment method.

**Value story (say it in the videos):** RestoreAssist's software fee is low because the client **brings their own AI key** (pays providers directly, at cost — cents per report) and **owns their data** (collected evidence stored on the client's device, not resold or cloud-locked).

## 8. Acceptance criteria
- [ ] New workspace cannot activate with zero Anthropic/OpenAI keys (gate RED) — trial included.
- [ ] Activation succeeds with exactly one valid Anthropic key; and (separately) one valid OpenAI key.
- [ ] An OpenAI-only client can generate an AI report end-to-end.
- [ ] Every "add your key" link lands on `/dashboard/settings/ai-providers`.
- [ ] `validateProviderKey` failure writes a status value the schema accepts (no enum mismatch).
- [ ] Wizard shows the key step first; both videos play (intro → how-to-get-key); cost/usage shown; videos re-rendered + CDN-resolved (200).
- [ ] In-app: a brand-new client is guided to install a key before anything else, and a report works afterward.

## 9. Rollout note
Most of §4 is sandboxed, testable code (gate logic, routing resolver, link/enum fixes, wizard step). The two video re-renders + uploads are the only credentialed/Chromium steps (run on host).
