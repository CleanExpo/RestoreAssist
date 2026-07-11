# RA-6946 — Disconnected-surfaces decision memo

**Ticket:** RA-6946 (Medium) · **Source audit:** SHIPIT `shipit-RestoreAssist-dd907f39-2026-07-03`
**Verified against:** `main` @ `171c5fcd` on 2026-07-11 (read-only). One audit claim (#3) was already
flagged stale; all four re-checked below. Numbers are current-code, not the 8-day-old audit.

Legend: **KEEP/PARK** = no code change now (track follow-up) · **DELETE** = destructive, founder OK required.

---

## Item 1 — `mobile/` Expo app → **DELETE-ELIGIBLE, but staged (founder OK required)**

> **Founder fact (2026-07-11): RestoreAssist is LIVE on the iOS App Store.** Verified below that the
> live binary is the **Capacitor** app, NOT this Expo `mobile/` app — but `mobile/` is not wholly inert.

**Verified — the live App Store app is Capacitor, not `mobile/`:**
- `docs/MOBILE_RELEASE_RUNBOOK.md`: *"App: RestoreAssist (Capacitor 8.3.0 wrapping
  https://restoreassist.app)"*; iOS release = Fastlane gym → TestFlight via `ios-release.yml`.
- `ios-release.yml` builds `ios/App/App.xcodeproj` (scheme `App`, `--export_method app-store`) — the
  Capacitor project (`npx cap sync ios`, Cap 6+ SPM). It **never** touches `mobile/`.
- `capacitor.config.ts` (`appId: com.restoreassist.app`, server-hosted WebView) comments narrate the
  real App Review journey — builds 1.0(2)/1.0(3), iPad Air review, TestFlight.

**Verified — `mobile/` is a dormant parallel Expo track:**
- Self-contained Expo app: own `package.json` (`restoreassist-mobile`), `pnpm-lock.yaml`,
  `node_modules`, `vitest.config.ts`. **Outside** root `pnpm-workspace.yaml`. **Not in CI.**
- Sync engine runtime **never invoked** — `mobile/lib/store.ts` imports only the `SyncStatus` *type*.
- Last genuine mobile-specific commits: RA-384 scaffold / RA-1728 launch-prep era; everything since
  (#904/#1199/#1795/#1814) is repo-wide sweeps, not development.

**WARNING — two reasons NOT to `rm -rf mobile/` blindly:**
1. **Live release-asset dependency.** Release runbook **§4.3** sources the Android adaptive icon from
   `mobile/assets/adaptive-icon.png` (synced via `npx cap sync android`). Deleting `mobile/` breaks
   that reference — the icon must be relocated (e.g. into `distribution/`) and §4.3 updated first.
2. **Shared identity.** `mobile/app.json` uses the **same bundle id** `com.restoreassist.app` and has a
   working EAS `submit.production` profile — a latent manual `eas submit` path. Nothing automated uses
   it, but confirm with founder that no release is ever cut from Expo before removing it.

**Recommendation:** staged delete — (a) relocate `mobile/assets/adaptive-icon.png` + any other
runbook-referenced assets, update runbook §4.3; (b) salvage the tested offline sync engine if
offline-first is on the Capacitor roadmap; (c) then delete `mobile/`; (d) prune `EXPO_TOKEN` from
Vercel env. All git-recoverable. **Do not delete until founder confirms the live app is only ever
released via Capacitor CI, not `eas submit`.**

## Item 2 — Push tokens with no sender → **PARK / keep (no delete)**

**Verified:**
- Registration is **iOS-only** (`components/providers/CapacitorProvider.tsx` `if (platform === "ios")`);
  captures the APNs token and POSTs it to `/api/push/subscribe`, which `deviceToken.upsert`s.
- Backed by two real migrations (`ra_1842_add_device_token`, tenant-scoped RLS policies).
- **Zero send path** anywhere — no FCM/APNs/web-push call; `lib/firebase-admin.ts` exports auth only.

**Recommendation:** keep the subscribe path (harmless; already collecting tokens for a future consumer;
audit itself notes **Restoration Pulse P1** could become the sender). Open a follow-up to build the
sender + Android registration branch when Restoration Pulse lands. Do **not** remove the route — that
would discard working registration + already-collected tokens.

## Item 3 — Live Teacher SSE route unrouted → **KEEP (do not delete)**

**Verified:**
- `app/api/live-teacher/session/route.ts` + `/turn` are real, tested SSE streaming. **No browser/UI
  caller** exists.
- **But** Live Teacher is flagship epic **RA-1132 (Urgent — declared product "true north")**, with
  backend actively hardened through July 2026: RA-6731 (turn wired to real cloud client, Done),
  RA-6963 (BYOK migration, Done 2026-07-03), RA-6798 (tool IDOR fix, Done 2026-06-18).

**Recommendation:** keep. The missing UI is intended future flagship work, not dead code. "Route it"
= build the voice-first UI, a flagship workstream — out of scope for this cleanup ticket. Track UI as
a follow-up under RA-1132.

## Item 4 — `similar-jobs` read endpoint → **DELETE the HTTP route (recommended, founder OK required)**

**Verified:**
- `app/api/inspections/[id]/similar-jobs/route.ts` (pgvector + BYOK) has **zero callers** — the only
  repo reference is a doc-comment in the sibling `vectorise-jobs/route.ts`.
- The report RAG path (`lib/ai/rag-context.ts`) **computes its own** pgvector query (raw SQL over
  `HistoricalJob`) + text fallback, independently. It does not hit the HTTP route.

**Recommendation:** delete the HTTP route + its test (`__tests__/route.test.ts`) — a disconnected
surface that duplicates the lib RAG path. Keep `lib/ai/rag-context.ts` (the real path). Keep
`vectorise-jobs` (embedding-population path — separate concern, verify its own caller separately).
*Alternative:* keep only if the route is meant as an external/public API — no evidence it is.

---

## Founder decisions — 2026-07-11 (final)

Founder confirmed **RestoreAssist is live on the iOS App Store**; verified the live binary is the
Capacitor build. Decisions taken:

| Item | Analyst rec | **Founder decision** | Follow-up |
|---|---|---|---|
| 1 · `mobile/` Expo orphan | Staged delete | **KEEP — do not delete (revisit later)** | Offline sync engine (`mobile/lib/sync/engine.ts`) flagged as **salvage candidate** for a future offline-first feature in the Capacitor app |
| 2 · Push tokens, no sender | Keep/park | **KEEP** | Build sender + Android branch when Restoration Pulse P1 lands |
| 3 · Live Teacher unrouted | Keep | **KEEP** | Build voice-first UI under flagship RA-1132 |
| 4 · `similar-jobs` route | Delete route+test | **KEEP** (possible external/public API) | Note the disconnect; wire a consumer or leave as external API |
| ops · `EXPO_TOKEN` in Vercel | Prune | **Deferred** (coupled to Item 1, which stays) | Revisit if/when `mobile/` is removed |

**Net for this ticket: zero deletions.** All four surfaces resolved to KEEP. This is
a legitimate triage outcome ("deletion is a valid outcome for each" — so is keep). The disconnected
surfaces are now *documented and decided*, not silently orphaned. RA-6946 can be closed as decided,
with the follow-up build work tracked separately (push sender; Live Teacher UI).

## Security closeout — 2026-07-11 (applied, founder-approved)

The SPM board flagged three agent-doable defensive items alongside the KEEP decisions. Founder
approved running all three; applied on branch `ra-6946-security-closeout`:

| # | Item | Fix applied |
|---|---|---|
| a | `mobile/eas.json` **loaded chamber** — a working `submit.production` profile was a latent manual `eas submit` path to the live bundle id `com.restoreassist.app` | Removed the `submit` block from `mobile/eas.json`. `eas submit -p ios --profile production` now has no configured profile. Nothing in CI/scripts referenced it (verified). |
| b | `mobile/` had no marker that it is dormant / not the shipping app | Added `mobile/README.md` — a DORMANT banner: live app is Capacitor via `ios-release.yml`, do not re-add an Expo submit profile, and why the dir is kept (icon asset + salvage sync engine). |
| c | `similar-jobs` route had auth + tenancy + subscription gate but **no rate-limit** on its BYOK-embedding + pgvector path | Added `applyRateLimit` (30 / 15 min, keyed by `session.user.id` per rule 8) before the paid path, with a regression test asserting 429-before-embedding. |

**Item 4 final stance (founder, 2026-07-11):** `similar-jobs` route **KEPT as-is, documented** — not
cut. The board's "no repo evidence of external use" is noted; the route stays as a declared external
API surface and is now rate-limited. Wire a consumer or leave as external API.

**`EXPO_TOKEN` in Vercel:** still **deferred** (coupled to Item 1, which stays). Founder-owned; not
part of this agent closeout.
