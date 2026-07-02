# BYOK Monetisation — Architecture Spec

**Owner decision captured:** 2026-07-03 (Phill) — "go P0+P1", approved from the full SPM audit of the Signup/BYOK model.
**Status:** P0 (platform-key gating) shipped across three PRs (#1638, #1639, this PR). P1–P4 remain queued per §5.
**Ticket:** RA-6921 (P0), parent epic RA-6920.
**Author:** Claude (Nexus) · 2026-07-03

---

## 1. The problem

Five parallel audits (2026-07-02) found the live product sells a credits-inclusive model while actually spending
RestoreAssist's own AI provider keys on client workloads:

- ~11 request-serving routes read `process.env.*_API_KEY` directly (voice-note-transcribe, auto-classify-photo,
  report download/synopsis, vision extract-reading, chatbot, margot/\*, support tickets, sketch import).
- All Cloudinary/Supabase media ran on platform credentials.
- None of the planned recurring add-ons existed as billable SKUs.
- Marketing copy promised "Premium API integrations included" — directly contradicting a BYOK model.

Judge score: 38/100 ship-now. Staged build approved: P0 platform-key gating first, monetisation layers after.

## 2. Target model

**$99/month AUD base** — the client's own keys/storage; the platform never pays for a client's AI workload — plus
five $11/month add-ons:

1. ElevenLabs Voice (client's API key + Voice ID required)
2. Field Technician seats (per-seat, unlimited, BYOK-gated, enforced at job assignment)
3. Online Bookkeeping Connection (Xero built; QuickBooks/MYOB outbound + contact sync to complete)
4. Service CRM Connection (Ascora / DR-NRPG built; needs an entitlement gate)
5. Payments Collection (bank-deposit recording exists; + Stripe Connect Standard on the client's own account for
   payment links; + Terminal/Tap-to-Pay in the technician app later)

Two-app model: the desktop dashboard is the CRM (office hub); the technician app is field capture.

## 3. P0 architecture — central BYOK-first key resolution

`lib/ai/resolve-workspace-ai-key.ts` is the single required entry point:

```ts
resolveWorkspaceAiKey(userId, provider): Promise<{ workspaceId, apiKey }>
```

It resolves the calling user's workspace, then that workspace's `ProviderConnection` row for the given provider.
Callers **must not** catch-and-fall-back to a platform env var — a missing key throws `NoWorkspaceKeyError`, and
the route decides its own failure mode:

- **Fail-closed (402/400)** — the workload has no non-AI value without the model: `chatbot`, `voice-note-transcribe`,
  `auto-classify-photo`, `sketch-import-from-image`, `vision/extract-reading`, `reports/synopsis`.
- **Graceful degrade** — the workload has a non-AI fallback and must never hard-fail a user-facing action:
  `similar-jobs` / `vectorise-jobs` (hash-embedding fallback), `support/tickets` triage (falls back to the
  caller-provided category, priority `"normal"`), `reports/download`'s optional AI executive-summary section
  (silently omitted).

A route reading a *legacy* per-user `Integration` key (pre-workspace model, `reports/synopsis`) tries the new
workspace resolver first and only falls back to the legacy `Integration` row — never to the platform env var.

**Staff-only exemption.** Routes gated by `verifyAdminFromDb` (no client workspace context at all — an operator
tool, not part of any client's $99/month workload) are intentionally left on the platform key, tracked in
`scripts/ai-platform-key-fallback-baseline.json`'s `platformInternalExceptions`: `admin/vectorise`,
`margot/chat`, `margot/corpus/status`, `margot/hermes-proxy`, `support/tickets/[id]/draft`, and the GitHub webhook
handler.

## 4. The audit gate

`scripts/audit-ai-call-sites.ts --gate` (wired into CI as `pnpm audit:ai`) fails the build when a new `app/**`
route reads a platform AI-provider key without a BYOK marker present, ratcheted against
`scripts/ai-platform-key-fallback-baseline.json` (`pendingMigration` + `platformInternalExceptions`).

Batch 3 closed a real detection blind spot: `hasAiSurface()` only recognised specific SDK call patterns
(`new Anthropic(`, `anthropic.messages.create`, ...), so a route that read
`process.env.ANTHROPIC_API_KEY` and handed it to a `lib/services/ai/*` helper — or called the Anthropic HTTP API
via a raw `fetch()` instead of the SDK — was invisible to the audit entirely, not merely unflagged. Fixed by:
adding `https://api.anthropic.com/` to the Anthropic provider-detection markers (parity with the existing OpenAI
raw-fetch check), and treating a bare read of a *named* AI-provider key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`) as itself an AI surface — scoped to those names specifically so
unrelated integrations (`RESEND_API_KEY`, `ASCORA_API_KEY`, `LINEAR_API_KEY`, ...) aren't misclassified.

## 5. Delivery batches (P0)

| Batch | PR | Routes |
| --- | --- | --- |
| 1 | #1638 | `resolveWorkspaceAiKey` foundation, `ai/voice-note-transcribe`, `audit-ai-call-sites.ts` gate |
| 2 | #1639 | `chatbot`, `inspections/[id]/similar-jobs`, `inspections/[id]/vectorise-jobs` |
| 3 | this PR | Detector blind-spot fix; `ai/auto-classify-photo`, `inspections/[id]/sketches/import-from-image`, `vision/extract-reading`, `support/tickets`, `reports/[id]/download`, `reports/[id]/synopsis`; `support/tickets/[id]/draft` baseline exemption |

`AiUsageLog.paidBy: byok | platform` and per-route-class tests are captured incrementally per batch rather than as
a single deferred item — see each route's `__tests__` for the BYOK/no-key/legacy-fallback coverage added in the
batch that migrated it.

## 6. Remaining phases (queued behind this spec, epic RA-6920)

- **P1 — entitlement layer.** `FeatureEntitlement` model, five recurring Stripe SKUs as subscription items,
  `requireAddon()` guard wired to voice/Xero/Ascora/DR-NRPG/payments surfaces, grandfathering for existing
  subscribers.
- **P2 — seats + dispatch.** Technician assignment model + scheduling calendar (the desktop↔field bridge), seat
  enforcement point.
- **P2b — Stripe Connect rail** on the client's own account for payment links.
- **P2c — contact sync + QuickBooks/MYOB outbound.**
- **P3 — marketing/pricing-page flip** to the BYOK model (single env switch once P0+P1 are fully live).
- **P4 — Stripe E2E + signup→PDF proof** (needs owner sandbox keys — RA-5624, RA-5615).

Each phase gates on the prior one landing in production; none is scheduled until P0 is fully verified (this spec's
§5 table, plus a green `pnpm audit:ai` on `main`).
