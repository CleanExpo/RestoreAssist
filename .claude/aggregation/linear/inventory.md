# Linear — RestoreAssist team inventory

**Pulled:** 2026-05-18
**Team:** RestoreAssist (`a8a52f07-63cf-4ece-9ad2-3e3bd3c15673`, key `RA`)
**Why this exists:** complete map of open Linear work for RA aggregation. Counts here are not exhaustive — Linear's `list_issues` API tops out at ~100/call. Numbers below cover open + recently-updated; older closed work isn't enumerated.

---

## Projects (active)

| ID | Name | Status | Lead | Target | Notes |
|---|---|---|---|---|---|
| `3c78358a-b558-4029-b47d-367a65beea7b` | **RestoreAssist Compliance Platform** | In Progress | Phill | 2026-06-30 | Sprint M complete (185 issues Done). Demo-ready — pilot outreach active. Pilots: Beyond Clean · Elite · CRSA. |
| `8027986f-e10d-4d46-9061-a3809e5dc8c3` | **RestoreAssist V2 — Sketch & Property Data** | Planned (Urgent) | — | — | 6 milestones all 100% progress per Linear (?? verify — likely a metadata quirk; the floor-plan epic RA-2947 is still in `Todo`). 12–16 week build. |
| `f45212be-3259-4bfb-89b1-54c122c939a7` | **Pi - Dev -Ops** | (cross-portfolio) | — | — | Where most of the audit-finding-2026-05-11 P0 tickets live (CI health, secrets, security). |
| `94da87f8-a2a5-4fbb-9903-0047ff84d92c` | **Margot - Personal Assistant** | — | — | — | Voice mode / dashboard / MCP / scheduled briefings. Several "In Review" tickets parked here. |

### Milestones on RestoreAssist Compliance Platform

| Milestone | Progress | Target | Why it matters |
|---|---|---|---|
| **Xero Stability Sprint** | 0% | 2026-06-20 | ATO EOFY 2026-06-30 lockout: any Xero reconciliation failure after that date is a compliance event. Issues: RA-868, RA-869, RA-870, RA-871, RA-920. Verify RA-902 stub-sync customer exposure first. |
| **Billing Platform v2** | 0% | 2026-07-31 | First-class billing integrations re-filed from RA-921 "hide unbuilt tiles" workaround. Unlocks after Track 2 (billing integrity). |

### Milestones on RA V2 (Sketch & Property Data) — all listed 100% in Linear

M1 Foundation · M2 Core Sketch Tool · M3 Property Data Scraper · M4 Moisture Mapping · M5 Settings & Onboarding · M6 Reporting & Export. **Suspicious — RA-2947 ("Pre-loaded floor plan epic") is still `Todo` and floor-plan workstream tickets RA-2948–onwards are `Todo` too. Either the milestone "progress" field is wrong, or the milestones were closed prematurely.** Resolve before relying on this project's status.

---

## P0 / Urgent issues (active or queued)

These are the ship-blockers right now. Source: `list_issues` with `priority=1` + `state=started|unstarted`, deduplicated.

### Production go-live gate (the spine)
- **RA-4956** — P0: Implement RestoreAssist 100/100 production go-live gate. *Ready for Pi-Dev.* The single hard release gate. **This issue is the master enforcement node for the production cutover; everything else maps to its sub-criteria.**
- **RA-1718** — V1 CUTOVER: Phase 5 production migration + pilot cutover. *Pi-Dev: In Progress.* Owner-action; Claude has prepped runbook + pilot checklist.
  - RA-1723 — Phase 5.5 soft pilot (1 friendly pilot, 0–24h). *Todo.*
  - RA-1724 — Phase 5.6 full pilot rollout (Beyond Clean / Elite / CRSA). *Todo.*

### Tests / CI / typecheck — direct blockers of the 100/100 gate
- **RA-4951** — P0: Stabilise CI test environment — Prisma integration suites fail without `DATABASE_URL`. *In Progress.*
- **RA-4952** — P0: Fix auth/paywall middleware regressions (trial expiry redirect + unauth pass-through). *Ready for Pi-Dev.*
- **RA-4953** — P1: Repair smoke test for Google Drive onboarding (strict locator conflict on `Show confirm password` button). *Todo.*
- **RA-4954** — P1: Resolve TypeScript route validator drift (`.next/dev` vs `.next/types`, missing `app/faq` modules). *Todo.*
- **RA-4955** — P1: Close moderate production audit vulns in `mermaid` dependency chain (4 moderate). *Todo.*

### SP-J handover (terminal CTA)
- **RA-4859** — Add POST `/api/inspections/[id]/handover` route. *In Progress.* SP-A close ships incomplete without this — half-built terminal state.

### Security / secrets / audit-finding-2026-05-11 cluster
- **RA-2989** — 6 secrets leaked in 2026-05-11 session + Anthropic credits depleted + stale 1Password tokens. *Todo.* P0 rotation backlog.
- **RA-3009** — `/api/admin/seed-demo` guarded by hardcoded query-param secret on prod — replace with `verifyAdminFromDb`. *In Progress.*
- **RA-3034** — Supabase **SERVICE_ROLE** key committed at `Pi-Dev-Ops/scripts/sync_harness_to_supabase.py:22`. *In Progress.* Live JWT in git history.
- **RA-3012** — Secret-value-stripper wrapper for `railway variables` (RA-2989 process hardening). *In Progress.*

### Portfolio CI / deploy health (touches RA prod path)
- **RA-3004** — `deploy-production.yml` workflow broken since 2026-04-25 — prod deploys haven't fired from CI in 16 days; `pnpm` missing in workflow. *In Progress.*
- **RA-3006** — Gitignore the 23 runtime-mutated `.harness/` state files (merge-conflict generator). *In Progress.*
- **RA-3025** — Restore `.npmrc` on main (Rana's 17:53 push dropped PR#150 fix — all 5 main workflows red on `npm ci` ERESOLVE). *In Progress.*
- **RA-2990** — CCW-CRM main branch CI/CD all failing on Cin7 BOM fix (commit 1d208774) — paying-client unshipping risk. *Todo.*

### SEO playbook (not a ship-blocker but Urgent in Linear)
- **RA-1664** — Dry-run full 10-task SEO playbook on RestoreAssist. *In Review.* Awaiting Phill 4-question sign-off; recommends replacing Tasks 5+6 (GBP/reviews) with software-directory (G2/Capterra/GetApp AU) health.

### Margot / Hermes carry-overs (Urgent priority but not RA-product blockers)
- RA-2232 — Deploy specialised Telegram agent swarm. *Todo.*
- RA-1691 — Install Voicebox on Mac mini. *Ready for Pi-Dev.*
- RA-1692 — Verify faster-whisper STT path on Mac mini. *Ready for Pi-Dev.*
- RA-1620 — Install MCP suite on Mac mini Hermes. *In Review.*
- RA-1662 — Create SEO site registry (`sites.yml`) for 7 in-scope businesses. *In Review.*

---

## High-priority issues (P=2) — open

Active / unstarted, sampled (full list paginates beyond a single MCP call):
- **RA-4176** — Board Meeting Memo 2026-05-12 (the "engineering house on fire while closing pilots" framing). *Todo.*
- **RA-2947** (Epic) — Pre-loaded property floor plan + on-site damage sketch overlay (Encircle/Magicplan/DocuSketch wedge). *Todo.* This is the V2 differentiator.
- **RA-2948** — Floor Plan 1/8: Research synthesis + data source decision. *Todo.* Writes to `docs/floor-plan/data-source-decision-2026-05-11.md`.
- RA-2996 — EPIC: 2026-05-11 Pi-CEO agentic-OS audit + remediation. *Todo.*
- RA-3006/3025/2906/2212/2213 — CCW-CRM + nodejs-starter CI fire-fighting work orders. *In Progress.*
- RA-2026 — HERMES application build pivot (board directive). *In Progress.*
- RA-1659 — Morning walkthrough end-to-end acceptance test. *Todo.*
- RA-1696 — Desk voice loop end-to-end smoke test + sign-off. *Todo.*
- RA-1693/1695 — Margot voice profile selection + lock. *In Review.*
- RA-1657/1656 — Margot Dashboard implementation + spec. *In Review.*
- RA-1655 — Deep Research agent + File Search compatibility. *In Review.*
- RA-1630 — Margot ↔ Pi-CEO HTTP delegation pattern. *In Review.*
- RA-1629 — Install 3 cron jobs and verify first runs. *In Review.*
- RA-1219 — `WebhookEvent` missing external idempotency key + unique index. *In Review.*

---

## Pi-CEO auto-PR backlog (low-information noise)
A wave of "[Pi-CEO] feat: Pi CEO build" tickets (RA-2221 through RA-2226 + RA-2968/2969) — autonomous-fix-pipeline tickets pointing at PR#919–924, #935, #936 on CleanExpo/RestoreAssist. Status `In Review`. **Need triage:** either merge the PRs, close the tickets, or kill the auto-pipeline. Currently they're inflating the in-progress count.

---

## Headline reads (synthesised from the above)

1. **Ship gate is RA-4956.** Five P0 sub-issues (RA-4951/4952/4953/4954/4955) feed it. Until those are green, the production-readiness claim is unsupported.
2. **RA-4859 (SP-J handover route)** is the last functional gap in the SP-A close flow. P0, in progress, single PR scope.
3. **Pilot cutover (RA-1718 → RA-1723 → RA-1724)** is owner-action gated; runbook is ready, soft-launch pilot needs picking (Beyond Clean recommended).
4. **The 2026-05-11 audit-finding cluster (RA-2989 / RA-3004 / RA-3009 / RA-3025 / RA-3034) is half-shipped** — three of five `In Progress` but RA-2989 still `Todo`. These are pre-pilot security blockers.
5. **Floor-plan V2 epic (RA-2947) is unstarted** despite all six milestones reading 100%. Project metadata likely wrong.
6. **Xero stability sprint hard-stops 2026-06-20** (ATO EOFY 2026-06-30 cutover). Currently 0% progress.
7. **Margot/Hermes work parked in `In Review`** — eight tickets waiting on Phill. None of them are RA-product ship-blockers but they tie up Hermes capacity that could otherwise be running RA pilot ops.

---

## Notes on completeness

- Linear's MCP `list_issues` paginates at ~100 issues and one call already hit token-budget overflow (saved to `tool-results/.../mcp-claude_ai_Linear-list_issues-1779061104070.txt` for the "updated in last 14 days" pull).
- The full "updated last 14 days" set is in that tool-result file; not transcribed here to keep this inventory readable. Read that file with `dd`/`cut -c` slicing if you need the complete delta.
- Closed issues and Sprint M's 185-Done backlog are not enumerated here — that's the "what got built" log; this inventory is "what's still moving."
