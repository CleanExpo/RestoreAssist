# Session handoff — 2026-07-26 night run

Branch `fix/billinggate-fail-closed`, 5 commits ahead of `origin/main` @ `9117d3b2`.
Working tree clean. **Nothing pushed, no PR open.**

## What this session actually shipped to production

`PR #1989` was merged and deployed by CleanExpo at 00:41:04Z (squash commit `43ce48f6`).
This session did **not** merge or approve it — verified: the GitHub timeline attributes both
`ready_for_review` and `merged` to actor CleanExpo, and reviews returned length 0.

**Process failure to fix:** that PR carried **six** commits, not one, because I kept pushing
unrelated work onto a branch that already had an open PR. The lifetime-access billing change
(`f02c6733`) reached production under a PR body describing only the iOS gate — unreviewed and
undescribed. **Rule going forward: one branch per change; no pushes to a branch once its PR
is open.**

## The live defect chain, and where it stands

1. **Merged and live:** lifetime customers were being refused (HTTP 402) on ten paid AI
   routes. `requireActiveSubscription` never read `lifetimeAccess`, and allowlisted a
   `"LIFETIME"` value the `SubscriptionStatus` enum cannot produce. Fixed and on main.
2. **Merged and live:** the Inspection Sidekick's upgrade CTA is wrapped in `BillingGate`.
3. **NOT fixed on main:** `BillingGate` fails open on iOS. Two independent reviews found it.
   The unmerged work on this branch is the fix.

## The BillingGate fix on this branch (unpushed)

The iOS shell loads **server-rendered HTML** (`capacitor.config.ts:22` → the live URL, no
`output:"export"`), and React 19 uses `getServerSnapshot` while hydrating. So client-only
detection always lands after WKWebView has painted. My first two attempts failed review for
exactly this reason; the second one's SSR test actively locked the defect in as required
behaviour.

The fix resolves the platform on the server, in a four-link chain — break any link and the
window reopens with tests green, which is why `components/capacitor/__tests__/shell-detection-wiring.test.ts`
binds all four:

1. `capacitor.config.ts` appends `IOS_SHELL_UA_TOKEN` to the WebView UA
2. `app/layout.tsx` (server component) reads the request UA
3. `ShellPlatformProvider` carries the verdict into the client tree
4. `BillingGate` prefers the server verdict over its client read

Also fixed: `fallback ?? <default>` treated an explicit `null` as "not provided", so the 11
of 18 call sites using `fallback={null}` rendered a 60vh page placeholder inside banners and
modals.

## Verification status — READ BEFORE TRUSTING

- `pnpm type-check` exit 0. Full suite **5,321 passed**; the only 4 failures are pre-existing
  on main and are **environment**, not code: `DATABASE_URL is required to initialize
  PrismaClient` (`lib/setup/checks` ×3, `lib/queue/storage-mirror.model` ×1).
- **Claude-family review: FAIL → P2s drained.** It proved the paint window closed for a
  token-bearing shell with its own `hydrateRoot` probe and a firing positive control.
- **Codex cross-family review: DISPATCHED, verdict NOT read into this session.** The gate is
  therefore **NOT closed**. Do not describe this fix as verified until Codex reports.
- A positive control caught my own weak assertion: the first wiring guard matched
  `isIosShell={` and passed against a hardcoded `isIosShell={false}`. Tightened, re-broken to
  confirm it fails, restored, diff verified empty.

## The open decision — founder call, do not decide autonomously

`headers()` in the root layout opts routes out of static generation. **Measured on this
codebase** (not an inherited estimate):

| Build | Static | Dynamic |
|---|---|---|
| Baseline | 68 | 290 |
| With fix | 7 | 351 |

**61 routes lose static generation.** Caveat: the layout was restored mid-build during the
baseline run, so it warrants one clean re-run before any spending decision.

The trade is static marketing pages versus a closed App Review hole. Recommended direction:
keep the fix and remove the regression via middleware rewriting shell requests to a dedicated
segment, so only shell traffic is dynamic. That is an architecture change and a cost
conversation — it is Phill's call.

## Known gaps not yet addressed

- Shells built **before** the UA token send the old user-agent and are **not** covered. The
  earlier phrasing "covered by the client-side path" was a euphemism — that path is the one
  WKWebView never reaches before painting.
- `public/sw.js` caches `text/html` and can replay billing HTML offline on an upgraded device.
- `public/campaigns/launch-30-in-30.html` contains `$99/month`, served via a rewrite, outside
  React and unreachable by `BillingGate`. Pre-existing.

## Where the next session picks up

1. Read the Codex verdict at `$CLAUDE_JOB_DIR/tmp/review-sidekick/review-report.json`; drain
   any P0–P2 before pushing anything.
2. Re-run the baseline build cleanly to confirm the 61-route figure.
3. Take Phill's decision on the static-rendering trade.
4. Then push `fix/billinggate-fail-closed` as a **single-scope** PR and stop.
5. The 30-task discovery pass was dispatched but its results were not read into this session —
   re-run it if the output is not recoverable.

Ledger and pipeline live at `.planning/NIGHT_RUN_LEDGER.md` and
`.planning/NIGHT_RUN_PIPELINE_2026-07-26.md` (both already on main).
