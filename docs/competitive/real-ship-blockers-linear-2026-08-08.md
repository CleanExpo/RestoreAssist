# Real open ship-blockers — pulled live from Linear 2026-08-08

Source: Linear MCP (`6118f2b6` connector, authenticated), RestoreAssist team, priority Urgent + High.
This SUPERSEDES `.claude/aggregation/MASTER_PLAN.md` (82 days stale) and the production-audit set
(also 2026-05-18) for backlog ranking. The vast majority of P1/P2 issues are `Done`/`Canceled` —
throughput has not been the constraint. What follows is only the **still-open** set, filtered to
what actually bears on shipping RestoreAssist.

## ⚠️ The finding that overturns the audit docs

**RA-7098 (High · Backlog · 2026-07-27) — "RA prod RLS is 3 tables, not 119 — SketchRoom,
EvidencePin, PortalContent."** This post-dates `docs/audits/restoreassist-audit-2026-07-12.md`,
which claimed a live prod read showing "RLS enabled on all 219 tables." They contradict. RA-7098 is
newer, open, and High. **Unresolved — needs live DB verification (founder-gated).** Until settled,
treat prod RLS coverage as UNKNOWN, not "done" and not "119 disabled". This is the single most
important item to verify before any pilot with real customer data.

## Meta-findings that discount the rest of the board

- **RA-6909 (High · In Progress) — "194 unverified Done tickets — verification ledger."** The board
  knows its own `Done` statuses are unproven. Consistent with the verifier hook being dead since
  2026-06-15. **Do not trust `Done` as `verified` for anything stamped in that window.**
- **RA-5624 (High · In Progress) — "Repair sandbox env health and release-gate smoke path."**
  Explains the A1 core-journeys and B4/B-smoke FAILs in the release-gate run — the sandbox smoke
  path is a known, actively-worked breakage, not a regression from the local session.

## Open RestoreAssist product/ship items (the real stage-1/2 spine)

| ID | P | Status | What | Gating |
|---|---|---|---|---|
| RA-6678 | Urgent | In Progress | ABR_API_GUID missing in prod → every ABN lookup fails, breaks onboarding | Founder (prod env) |
| RA-6999 | Urgent | In Progress | 100/100 go-live scorecard — live distance-to-launch tracker (the RA-4956 gate) | — |
| RA-7098 | High | Backlog | prod RLS is 3 tables not 119 (SketchRoom, EvidencePin, PortalContent) | Founder (DB verify) |
| RA-6909 | High | In Progress | 194 unverified Done tickets — verification ledger | — |
| RA-5624 | High | In Progress | Repair sandbox env health + release-gate smoke path | — |
| RA-6955 | High | In Progress | Finish send.restoreassist.app DNS (SPF/bounce MX) + support@ inbound | Founder (DNS) |
| RA-7075 | High | Backlog | V1 Phase 0 — founder decisions + merge/env gates to unblock continuous impl | Founder |
| RA-7100 | High | Backlog | Client Confidence Hub — foundation, document centre, recovery hardening | — |
| RA-6948 | High | In Progress | Restoration Pulse — live drying tracker + zero-login client updates (judge 84/100) | — |
| RA-7076 | High | Backlog | Evidence Capture Engine — twin-anchored evidence, per-room confidence | — |
| RA-7091 | High | In Progress | Native Apple RoomPlan LiDAR floor plans (no Matterport) | iOS resourcing |
| RA-7078 | High | Backlog | Margo Knowledge Platform — governed knowledge-steward pipeline (BYOK) | — |
| RA-7077 | High | Backlog | Margo Quiet Co-Pilot — multi-domain AU KB, recommend-not-command | — |
| RA-7095 | High | Backlog | RA-7090 fail-closed evidence signing — DRAFT PR #1990, needs human merge | Founder (merge) |
| RA-2974 | Urgent | Blocked | Legal review — Locometric LiDAR floor-plan patents (US 11,269,060 + 8,868,375) | Legal/founder |

## Open, but NOT RestoreAssist-product (infra/fleet — off the ship board)

RA-7120 (pr-release-gate runtime_execution PASS hole), RA-7099 (destructive-action gate dead),
RA-7062/7070/7069/7066/7067/7068/7071 (Nexus fleet), RA-7115 (Synthex drift), RA-4190 (CARSI
Turnstile), RA-1664 (SEO playbook dry-run), RA-7124/7123 (dream infra), RA-7118/7117/7119
(lessons_durable migration), RA-7121/7109/7131/7130/7129/7128 (stall-killer / scope-from-artifact),
RA-7092/7094/7093 (post-merge evidence reconciles). These matter for the estate but do not block
selling RestoreAssist.

## Note on patent exposure (RA-2974, Urgent, Blocked)

Locometric LiDAR floor-plan patents are flagged as an Urgent legal-review blocker on the RA-V2
sketch/LiDAR line — directly relevant to any RoomPlan/floor-plan feature (RA-7091) and to the
Encircle competitive work, since floor-plan/sketch is one of Encircle's lead capabilities. Do not
scope floor-plan features without resolving this.
