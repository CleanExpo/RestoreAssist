# Pilot Cutover Checklist — V1 Launch

**Owner:** Phill McGurk
**Created:** 2026-04-26
**Pilots:** Beyond Clean, Elite, CRSA
**Pre-req:** [PHASE_5_RUNBOOK.md](./PHASE_5_RUNBOOK.md) §3–§5 all [PASS]

This is the per-pilot onboarding sequence. Run it once for the soft
launch (one pilot only) and then again, in parallel, for the remaining
two once the soft pilot has 24h of clean prod telemetry.

> **Soft launch first.** Pick the friendliest pilot for the first
> 24-hour window. Two-pilot/three-pilot rollout follows on day 2 only
> if telemetry stays green.

---

## Per-pilot prep (Claude can prepare these — execution is Phill)

### A. Account provisioning

| #   | Item                                                 | Notes                                                                                                                | Done? |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----- |
| A.1 | Pilot org/workspace created in prod                  | Use Admin → Workspaces. Record workspace ID.                                                                         | [ ]     |
| A.2 | Pilot owner invited via SSO/email                    | Pilot owner clicks invite themselves. **Do not auto-create accounts.**                                               | [ ]     |
| A.3 | Pilot owner sets initial daily AI budget             | `Workspace.aiDailyBudgetUsd` defaults from env (50 USD). Override per pilot in Admin → Workspace settings if needed. | [ ]     |
| A.4 | Pilot's first technician invited as workspace member | Confirms RA-1711 batch 2-5 grants access to inspection sub-routes for non-owner.                                     | [ ]     |

### B. Data residency + privacy

| #   | Item                                                                         | Notes                               | Done? |
| --- | ---------------------------------------------------------------------------- | ----------------------------------- | ----- |
| B.1 | Pilot acknowledged Privacy Act 1988 + NDB notice                             | Email reply or Pi-Sign attestation. | [ ]     |
| B.2 | Pilot acknowledged that AU data residency is V1.1 (currently US-fronted CDN) | Disclosed in pilot agreement.       | [ ]     |
| B.3 | Pilot's contact emails recorded in Linear ticket for incident escalation     | One technical, one commercial.      | [ ]     |

### C. Smoke per pilot (before they run their first job)

```bash
# Phill or Claude runs this against prod with pilot creds in a private shell.
BASE_URL=https://app.restoreassist.com.au \
  PILOT_EMAIL="<pilot owner email>" \
  PILOT_PASSWORD="<one-time test pwd>" \
  npx playwright test e2e/pilot-workflow.spec.ts --reporter=line
```

| #   | Item                                                                     | Done? |
| --- | ------------------------------------------------------------------------ | ----- |
| C.1 | Login → dashboard renders                                                | [ ]     |
| C.2 | Create test inspection → save                                            | [ ]     |
| C.3 | Create test claim → progress through stabilisation → attest with Pi-Sign | [ ]     |
| C.4 | Generate WATER assessment → JSON download works                          | [ ]     |
| C.5 | Download PDF (RA-1717 follow-up)                                         | [ ]     |
| C.6 | Click "Open assessments" link from claim detail (RA-1717 follow-up)      | [ ]     |
| C.7 | Delete the test data                                                     | [ ]     |

### D. Observability hookup

| #   | Item                                                                | Notes                                                                                                                            | Done? |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----- |
| D.1 | Add pilot's workspace ID to Vercel runtime log search saved view    | Filter: `workspaceId="<pilot WS id>"`                                                                                            | [ ]     |
| D.2 | Slack #restoreassist-pilots gets pilot owner / technical contact    | Manual invite                                                                                                                    | [ ]     |
| D.3 | Vercel observability alert configured for `5xx` rate > 1% over 5min | Vercel → Observability → Alerts                                                                                                  | [ ]     |
| D.4 | Anthropic budget alert (50% / 80% / 100% of daily)                  | Workspace.aiDailyBudgetUsd thresholds in `lib/ai/budget-guard.ts` already log; verify Vercel log search captures BUDGET_EXCEEDED | [ ]     |

### E. Comms

| #   | Item                                                                                                          | Notes                                       | Done? |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----- |
| E.1 | Pilot launch email sent (template in `docs/compliance/`)                                                      | Recipients: pilot owner + technical contact | [ ]     |
| E.2 | Pilot owner has Phill's mobile number for 72h on-call                                                         | SMS / Telegram                              | [ ]     |
| E.3 | Linear ticket "RA-XXXX [PILOT] <pilot name> — soft launch day 1" created with the contact pair + workspace ID | Tracks the 72h on-call window               | [ ]     |

---

## Day-1 monitoring window (first pilot, 0–24h)

| #   | Item                                                                                                                                | Done? |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ----- |
| M.1 | Hourly check of Vercel runtime logs for `console.error` spikes                                                                      | [ ]     |
| M.2 | Check `_prisma_migrations` table — no rollback rows                                                                                 | [ ]     |
| M.3 | Check `AssessmentGeneration` row count grows when pilot generates artefacts                                                         | [ ]     |
| M.4 | Spot-check workspace AI budget: `SELECT * FROM "AiUsageLog" WHERE "workspaceId" = '<pilot WS>' ORDER BY "createdAt" DESC LIMIT 20;` | [ ]     |
| M.5 | Pilot owner has not raised P1 in Slack                                                                                              | [ ]     |

If M.1–M.4 stay green for 24h, proceed to Day-2: invite the remaining
2 pilots (Elite + CRSA) using the same A–E checklist.

---

## Rollback decision tree

| Signal                                             | Severity | Action                                                                                         |
| -------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| Single pilot user can't log in                     | P2       | Investigate auth + session — do not roll back                                                  |
| All users 5xx on `/dashboard`                      | P0       | Roll back per [PHASE_5_RUNBOOK.md §6](./PHASE_5_RUNBOOK.md#6-rollback-sop-if-any-of-3-5-fails) |
| Migration left schema in broken intermediate state | P0       | Restore from §3.1 backup                                                                       |
| Anthropic spend spike outside budget guard         | P1       | Revoke org's BYOK key, set `aiDailyBudgetUsd = 0` for affected workspace                       |
| Single domain assessment fails (e.g. STORM)        | P2       | Disable that domain in `lib/assessments/registry.ts`, ship a hotfix                            |

---

## Day-7 retro

| #   | Item                                                                                                                                          | Done? |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| R.1 | Linear retro ticket created with: incident count, P0/P1/P2 split, mean time-to-fix, AI spend per pilot, # of assessments generated per domain | [ ]     |
| R.2 | Backlog grooming based on the retro — V1.1 ticket priorities adjusted                                                                         | [ ]     |
| R.3 | Memory file `feedback_pilot_lessons.md` updated under `~/.claude/projects/-Users-phill-mac-Pi-CEO/memory/`                                    | [ ]     |
