# Data Hygiene Audit — 2026-06-15

Senior-PM-led audit across four domains (Linear, Supabase, Environment Variables,
Connections), run by four parallel specialist teams, then re-scoped by ownership.

## [WARN] Ownership reality (read first)

The RestoreAssist Supabase prod project (`udooysjajglluvuxkijp`) is **shared by multiple
apps**. Many Supabase advisor findings are on tables/functions that are **NOT in this repo's
Prisma schema or migration history** — RestoreAssist migration PRs cannot touch them. Each
finding below is tagged:

- **RA** — RestoreAssist-owned; fixable via a Prisma migration PR in this repo.
- **FOREIGN** — owned by another app sharing the DB (or Supabase-managed); needs the owning
  repo OR a direct-Supabase migration (gated prod-write), and its columns aren't visible here.
- **GATED** — needs a permission/value only the founder holds.

## P0 — CRITICAL (live security exposure)

| #   | Finding                                                                                                                                                                                         | Owner               | Status                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 8 tables RLS-disabled, anon-readable/writable: `CaptureToken`, `ClientEvidenceSubmission`, `SketchElement`, `Hazard`, `InsuranceContext`, `SketchMoistureReading`, `Material`, `InsurerProfile` | **RA**              | [PASS] **DONE — PR #1326** (merged). ENABLE RLS + tenant/reference policies; runtime-validated (applies clean, tenant-isolation proven on real PG16).                                                |
| 2   | 7 ERP tables on `USING(true)` → any authenticated user reads all rows: `products`, `customers`, `orders`, `order_items`, `quotes`, `quote_items`, `PushToken`                                   | **FOREIGN + GATED** | Not in this repo (no model/migration). Can't be fixed here and can't even be drafted (foreign columns unknown). Needs the owning app OR direct-Supabase access. **Top remaining live exposure.** |

## P1 — HIGH

| #   | Finding                                                                                                                                                  | Owner     | Status / fix                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | `ABR_API_GUID` missing from PROD Vercel → ABN lookups malformed in prod                                                                                  | **GATED** | Founder value: `vercel env add ABR_API_GUID production` (+ `ABR_BASE_URL`).                                                                                                            |
| 4   | `NODE_TLS_REJECT_UNAUTHORIZED` set in sandbox-prod (TLS-verify smell)                                                                                    | **GATED** | Founder investigate/remove.                                                                                                                                                            |
| 5   | 4 security-definer fns executable by anon: `handle_new_user`, `verify_client_invite` (**FOREIGN**); `is_workspace_member`, `is_workspace_owner` (**RA**) | mixed     | RA pair: search_path pinning is HIGH blast radius (every RLS policy depends on them) — defer to a careful, isolation-harness-tested change, not a quick win. Foreign pair: owning app. |
| 6   | Public storage bucket `evidence-optimised` allows listing                                                                                                | **GATED** | Drop the list policy (Supabase dashboard / direct).                                                                                                                                    |

## P2 / P3 — MED/LOW

- **Sandbox missing secrets** (GATED — founder values): `RESEND_API_KEY`, `XERO_WEBHOOK_KEY`, `PORTAL_SECRET`, and the `ELEVENLABS_API_KEY` typo (`ELEVELLABS_API_KEY`).
- **FK indexes / dup index** (mixed): `FieldCaptureEvent.userId` + `MediaAsset` dup-index are **RA** (small P3 perf); `ClientInvite.createdByUserId`, `MobileInspection.*` are **FOREIGN**.
- **9 functions search_path mutable / 514 unused indexes / 243 auth_rls_initplan** — mostly low-value perf; the unused-index list is NOT a blind-drop (low traffic ≠ redundant).
- **`.env.example` drift** (**RA**, AGENT): document `GOOGLE_REDIRECT_URI`, `MARGOT_*`, `SETUP_WIZARD_ENABLED`, `CLOUDINARY_URL`.

## Linear — board cleanup (GATED on permission)

63 open issues; ~12 real RA product work. **Writes blocked by the auto-mode permission
classifier** — needs the `save_issue`/`save_comment` allow via `/permissions`. Once granted:

- **CLOSE (≥85 conf):** `RA-5628`, `RA-5629`, `RA-6585`–`RA-6592` (8 Scout tickets).
- **RE-FILE (~26, reviewed batches — NOT auto-fire; notification/audit churn):** Margot, Pi-Dev-Ops, CCW-CRM, Brand OS.
- **DECIDE:** `RA-2989` (secret-leak rotation?), `RA-5630` (Dependabot re-landed?), `RA-2947`+children (superseded by Mapping V2?).

## Connections — DONE

`~/.claude/skills/library/connections.md` corrected: stale `mcp__claude_ai_*` prefixes →
ToolSearch note; two distinct Stripe accounts split; dead Vercel CLI account (`zenithfresh25`)
flagged for re-auth; dead servers (`Claude_in_Chrome`, `aip-readonly`) marked.

## Bottom line

P0 #1 (the one critical RestoreAssist-ownable exposure) is fixed and merged. Everything else
of substance is FOREIGN (other-repo or direct-Supabase) or GATED (founder permission/value).
The cleanup is no longer a RestoreAssist-repo engineering problem — it's a permission grant +
cross-repo routing problem.
