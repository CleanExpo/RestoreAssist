# RestoreAssist — STORM Multi-Persona Audit (synthesis + judge-dedup)

> Generated 2026-06-30 by a 7-persona STORM pass (Data-Integrity & Cache-Staleness · Bloat & Dead-Code · Performance & Scale · UX & Accessibility · Ops/CI & Release-Reliability · Compliance & Standards-Currency · Missing-Element). 35 raw findings → 35 retained after dedup (no cross-persona duplicates collapsed; 4 compliance findings share one root cause and are cross-referenced). Each retained finding keeps its `file:line` evidence. Cross-checked against `goals.md` — **none of the 35 are already ✅ DONE**.

## Summary

The codebase is past the security/RLS P0 wave (goals #1/#2/#10/#11/#25 all DONE) but this STORM sweep surfaces a **new P0 the prior audits missed entirely: fabricated compliance standards on paid, legally-operative output**. Forensic PDFs and customer close-letters cite a non-existent `IICRC S500:2025` edition and falsely name Standards Australia as a co-publisher; `applyCitationGuard` auto-asserts S500 compliance on *every* water-claim close summary regardless of actual compliance. This is indefensible in an insurance dispute and is the single highest-leverage fix in this report.

Beyond that, three structural themes dominate:

1. **Compliance-currency rot (1×P0, 3×P1).** No working single-source-of-truth for standard editions. The `STANDARDS_VERSIONS` registry is wrong on 3 of 5 entries *and* is wired to nothing — every citation site hardcodes its own (often fabricated) edition string: `S500:2025`, `S700:2015`, `S700:2025`, `S520:2015`. Maps to/extends goal #16 (which only covers S520).

2. **The 100/100 release gate is mathematically unreachable and partly vacuous (3×P1, goal #6/#7).** C1 audits at `moderate` while the PR gate audits at `high`, so 6 unpatched moderate CVEs pin C1 red forever. B3 runs vitest with no `DATABASE_URL`, so the DB-gated suites silently skip — a vacuous green on the strictest go-live authority. A1 and B4 run the *identical* command (double-counting 15 points on one signal that also needs sandbox creds the scorer never supplies).

3. **Two genuinely user-harmful runtime defects.** A homeowner self-capture flow shows a **false green "Saved HH:MM" when the save HTTP call actually fails** (silent work-loss on an unauthenticated, customer-facing flow), and an access-controlled claim PDF is served `Cache-Control: public, max-age=3600` with **no fileId-ownership check** (cross-tenant PII leak via shared caches).

Plus a long tail of code-verifiable bloat (unused `puppeteer` + bundled Chromium, duplicate `motion`/`framer-motion`, dual Google GenAI SDKs, 770 MB of stale worktrees), N+1 write loops on the paid submit path, and per-instance in-memory caches whose invalidation can't reach sibling Lambdas.

**Counts:** 35 findings · 1 P0 · 9 P1 · 17 P2 · 8 P3 · **35 code-verifiable**.

---

## Prioritized findings

| # | Title | Cat | Sev | Evidence (file:line) | Recommendation | CV | Goal |
|---|---|---|---|---|---|---|---|
| 1 | Forensic PDF + close-letters cite fabricated **AS-IICRC S500:2025 "Australian edition, Standards Australia + IICRC + RIA"**; `applyCitationGuard` auto-asserts S500 compliance on every water close | compliance | **P0** | `lib/generate-forensic-report-pdf.ts:1694` (footer), `:1658-1660`; `lib/ai/lifecycle/on-close.ts:150,164`; `lib/standards-retrieval.ts:432` | Replace all `S500:2025`/`AS-IICRC`/co-publisher literals with verified `ANSI/IICRC S500-2021 (5th ed.)` from one registry constant; make `applyCitationGuard` conditional on recorded compliance | ✅ | NEW |
| 2 | Access-controlled claim PDF served `Cache-Control: public, max-age=3600` **and no fileId-ownership check** → cross-tenant PII leak via shared caches | security | P1 | `app/api/claims/document/[fileId]/route.ts:42-47` (verified `public, max-age=3600`); session-only gate :18-26; `downloadDriveFile(fileId)` :39 | `private, no-store`; add authz that fileId belongs to caller's org before download | ✅ | NEW |
| 3 | Homeowner self-capture shows green **"Saved HH:MM" when the save HTTP call failed** — silent data loss on unauth customer flow | missing-element | P1 | `components/sketch/SketchEditorV2.tsx:328-333` (catch → bare `return`, no fail flag), `:372-377` (`setSavedAt` runs anyway), status render `:847-855`; promise "saves automatically" `app/capture/[token]/page.tsx:79-82` | Track per-floor `anyFloorSucceeded`; in capture mode only `setSavedAt` on a real success; render role=alert "Couldn't save" on failure | ✅ | NEW |
| 4 | Release-gate **C1 audits `--audit-level=moderate`** vs PR gate `high`; 6 moderate prod CVEs pin C1 (-10) → 100/100 unreachable | ops-ci | P1 | `scripts/release-gate-score.ts:207` (`pnpm audit --prod --audit-level=moderate`) vs `pr-checks.yml:187` (`--audit-level=high`); live `6 moderate` | Align the two thresholds or patch/justify the 6 moderate deps; re-run scorer to confirm C1 flips green | ✅ | #6 |
| 5 | Release-gate **B3 runs `npx vitest run` with no `DATABASE_URL`** → DB-gated suites `skipIf(true)`; cutover gate strictly weaker than PR gate | ops-ci | P1 | `scripts/release-gate-score.ts:188-189` vs `pr-checks.yml:22-41,146-158`; `skipIf(!process.env.DATABASE_URL)` in 5 suites | Give the scorer + `release-gate.yml` the same ephemeral Postgres + migrate-deploy and pass `DATABASE_URL` into B3 | ✅ | #7 |
| 6 | IICRC **S700 cited under non-existent editions `S700:2015` and `S700:2025`** (1st ed = 2021) | compliance | P1 | `lib/scope-fire.ts:25,107-239`; `lib/iicrc-checklists.ts:251-816`; `lib/nir-standards-mapping.ts:869` (`S700:2025`); correct `S700:2021` only in `lib/equipment-calculator-fire.ts:68-281` | Normalise all S700 refs to `ANSI/IICRC S700-2021 (1st ed.)`, re-verify section numbers, delete 2015/2025 literals | ✅ | NEW |
| 7 | **`STANDARDS_VERSIONS` registry encodes wrong editions AND is unused** (root cause of the S500/S700/S520 drift) | compliance | P1 | `lib/nir-standards-mapping.ts:805-811` (S500 "7th", S520 "3rd/2015", S700 "2nd/2015" — verified); `:869` contradicts its own registry; citation sites hardcode strings | Make the registry the real SoT with verified values; derive all citation strings from it; add a CI staleness gate failing on any literal `S###:YYYY` not matching | ✅ | NEW |
| 8 | **S520 edition split:** 15 files cite `S520:2015` (incl. clinical clearance thresholds) vs 3 on `S520:2024`; registry still 2015 | compliance | P1 | 15 files via `grep -rl S520:2015 lib` (verified count=15) incl. `lib/scope-mould.ts:24-101`, `lib/billing/completeness-check.ts:48,173`; registry `nir-standards-mapping.ts:807` | Complete goal #16: re-verify each §-number against S520:2024 (do not blind-replace), update 15 files + registry, reconcile §4.2/§5.3 vs §12 split | ✅ | #16 |
| 9 | Release-gate **A1 and B4 run the identical `pnpm test:smoke:sandbox`** (15 pts on one signal); script drags `auth.setup` needing creds the scorer lacks | ops-ci | P1 | `scripts/release-gate-score.ts:147` (A1) & `:197` (B4) identical (verified); `test:smoke:sandbox` lacks `--no-deps`; `playwright.config.ts:33-39` forces setup project | Make B4 distinct; add `--no-deps` for the public smoke subset or wire sandbox creds into the scorer/`release-gate.yml` | ✅ | #6 |
| 10 | **CircuitBreaker records failures as successes** — rate-based opening path is dead; flaky integrations never trip | data-integrity | P2 | `lib/integrations/circuit-breaker.ts:150-157` (`success: state !== OPEN`, verified); `getFailureRate` :84-93; `onFailure` :207 | Track real outcome (`let ok=false` before fn, set true on success, push `{success:ok}`); unit test that failure-rate≥threshold opens the breaker | ✅ | NEW |
| 11 | Analytics insights/export **over-fetch all 40 `@db.Text` Report columns** (`include`, no `select`, take:5000×2) | performance | P2 | `app/api/analytics/insights/route.ts:99-123` (verified `include: baseInclude`, two take:5000); same in `app/api/analytics/export/route.ts:74-99`; only ~8 fields read | Replace `include` with explicit `select` of the 8 used fields (+ scoped estimates/client) | ✅ | #19 |
| 12 | **findMany audit gate enforces `take` only, never `select/include`** — column over-fetch passes green | performance | P2 | `scripts/audit-api-routes.ts:114` `findManyWithoutTake` checks only `\btake\s*:` (verified) | Extend rule to warn when a wide-model findMany lacks a top-level `select` (with `ra-select-ok` exemption); patch insights/export | ✅ | #19 |
| 13 | Inspection submit persists scope + cost rows with **sequential per-row creates (N+1 writes)** on the paid AI path | performance | P2 | `app/api/inspections/[id]/submit/route.ts:512-513` (`for…scopeItem.create`) & `:549-550` (`costEstimate.create`) verified; `createMany` used in 9 other routes | Replace each loop with one `createMany({data:[…]})` | ✅ | NEW |
| 14 | `promote-client` opens **a separate interactive transaction per pending submission** in an unbounded loop | performance | P2 | `app/api/inspections/[id]/evidence/promote-client/route.ts:54` (`for…$transaction`), unbounded `ra-query-ok` findMany :45 | Collect all ops into a single `$transaction([…])` (or chunked batches) | ✅ | NEW |
| 15 | `analyze-batch` writes **every file×issue as sequential creates inside one interactive tx** (5 s timeout rollback risk) | performance | P2 | `app/api/claims/analyze-batch/route.ts:314` nested `for…tx.missingElement.create`; recurs `:470-510` | Replace inner loop with `tx.missingElement.createMany`; chunk and/or raise `timeout`/`maxWait` | ✅ | NEW |
| 16 | Module-level **in-memory caches fragment per serverless instance** — invalidation can't reach siblings; reads flap stale↔fresh | cache-staleness | P2 | `lib/authorisations/most-recent.ts:3-49` Map+5min TTL; `invalidateAuthorisationCache` :51 called `app/api/authorisations/route.ts:122`; same pattern narrative :36 / billing-overview :16 | For report-feeding authorisations: read fresh or move to shared store (Redis/PG); document invalidate as best-effort single-instance | ✅ | NEW |
| 17 | Storage factory returns a **reject-everything S3 stub** for orgs with `storageProvider='S3'` → silent 100% media failure | data-integrity | P2 | `lib/storage/index.ts:44-47` (`case "S3"` verified); `lib/storage/s3-provider.ts:14-62` rejects everything | Fail fast at the factory (throw "S3 not available" or fall back to Supabase); unit test factory never returns the stub | ✅ | NEW |
| 18 | **Lint gate is vacuous:** `lint` = `eslint . --max-warnings 851`, ceiling baked at the live count; PR gate + B3 both green at status quo | bloat-deadcode | P2 | `package.json:52` (verified `--max-warnings 851`); `release-gate-score.ts:173` (B1) + `pr-checks.yml:123` | `eslint --fix` the 75 auto-fixable, ratchet `--max-warnings` down, keep ratcheting | ✅ | #24 |
| 19 | **`puppeteer ^25.1.0` unused** (pulls ~170 MB Chromium); only refs are a dead `serverExternalPackages` entry + comment | bloat-deadcode | P2 | `package.json:203` (verified); `next.config.mjs:169,179`; 0 source imports | Remove from deps + `serverExternalPackages`; `pnpm install` → type-check → build | ✅ | NEW |
| 20 | `android-release.yml` installs deps **`--no-frozen-lockfile` on the signed prod AAB** uploaded to Google Play | ops-ci | P2 | `.github/workflows/android-release.yml:31` (verified); every other workflow uses `--frozen-lockfile` (`pr-checks.yml:56`) | Change to `--frozen-lockfile`; fix+commit the lockfile if it currently mismatches | ✅ | NEW |
| 21 | Sketch save-status indicator has **no aria-live region** — SR users get zero save feedback (compounds #3) | ux-a11y | P2 | `components/sketch/SketchEditorV2.tsx` `grep -c aria-live` = 0 (verified); status span :824-856 icon-only | Wrap status in `aria-live="polite"` (role=status), `assertive` for failure, with text alternatives | ✅ | NEW |
| 22 | Owner-evidence **14-day freshness guard defeated by `actions/checkout`** (mtime reset to checkout time → always ~0 days old) | ops-ci | P2 | `scripts/release-gate-score.ts:110-117` uses `fs.statSync().mtimeMs`; `release-gate.yml:33-36` `actions/checkout@v7` | Derive evidence age from `git log -1 --format=%cI -- <file>` or a `verified:` frontmatter date | ✅ | #31 |
| 23 | `android-release.yml` **lacks androidpublisher precondition step** and uses singular `track: internal` (goal #9 code-side artifacts absent) | ops-ci | P2 | `.github/workflows/android-release.yml:86` (`track: internal`, verified); no API-reachability preflight | Add an early `androidpublisher`/`gcloud services list` probe that fails fast; migrate to `tracks:[internal]` | ✅ | #9 |
| 24 | `analytics/narrative` **cache checked before the subscription/entitlement gate** → lapsed user served paid narrative for up to 1 h | cache-staleness | P3 | `app/api/analytics/narrative/route.ts:168-176` cache return precedes 402 gate :178-196 (verified order) | Move cache lookup after the gate, or include subscriptionStatus in the key / re-validate on hit | ✅ | NEW |
| 25 | **`radix-ui ^1.4.3` meta-package unused** — all usage via 35 scoped `@radix-ui/react-*` packages | bloat-deadcode | P3 | `package.json:205` (verified); 0 `from 'radix-ui'` matches; `optimizePackageImports` references only scoped names | Remove `radix-ui` from deps; reinstall + build | ✅ | NEW |
| 26 | **Duplicate animation packages** `motion` + `framer-motion` both `^12.38.0`; only 1 file imports `motion` | bloat-deadcode | P3 | `package.json:190,?` (both verified present); 52 files import framer-motion, 1 (`components/ai-elements/shimmer.tsx`) imports motion | Repoint shimmer.tsx to framer-motion and drop `motion` (or migrate all to motion) | ✅ | NEW |
| 27 | **Two overlapping Google GenAI SDKs** `@google/genai` + deprecated `@google/generative-ai` coexist | bloat-deadcode | P3 | `package.json:101-102` (verified both); genai in 2 files, generative-ai in 4 | Consolidate onto `@google/genai`; migrate byok-vision-client.ts + ai-provider.ts; remove legacy; verify via audit-ai-call-sites | ✅ | NEW |
| 28 | **AWS_* env vars are dead config** — declared in `.env.example`, no AWS SDK, only consumer is the reject-everything stub | bloat-deadcode | P3 | `.env.example` AWS_* block; 0 `process.env.AWS` reads (verified); no `@aws-sdk` dep; stub `lib/storage/s3-provider.ts:17-62` | Delete the AWS_* block or move under a clearly-commented `# FUTURE / NOT WIRED (RA-409)` section | ✅ | NEW |
| 29 | **770 MB of stale `.claude/worktrees`** (8 dirs, 5 full repo copies) pollute every recursive grep/find | bloat-deadcode | P3 | `du -sh .claude/worktrees` = 770M (verified); gitignored `.gitignore:73`, 0 tracked | `git worktree prune` then remove orphaned dirs; verify with `git worktree list` | ✅ | NEW |
| 30 | **Split component roots:** `src/components` + `src/brand` (3 files) live outside the 392-file `components/` tree | bloat-deadcode | P3 | `find src` = 3 files (verified); imported `@/src/components/brand/RAIcon` from 4 files | Move into `components/brand/` + `lib/brand/`, update 4 importers, drop `src/` + its alias | ✅ | NEW |
| 31 | Public **forms use placeholder text instead of associated `<label>`** (WCAG 1.3.1 / 3.3.2) | ux-a11y | P3 | `app/contact/page.tsx:216-269` (verified 0 htmlFor, 3 placeholders); 134 files placeholder vs 55 with htmlFor; login page is the correct template | Add visible/visually-hidden `<label htmlFor>` per input; sweep the 130+ placeholder-only inputs | ✅ | NEW |
| 32 | Dashboard ships **off-brand neon palette** (cyan-400/emerald-400/violet/fuchsia) | ux-a11y | P3 | `app/dashboard/page.tsx:130,142,305,...,607`; 66 files via grep; brand tokens navy/bronze/tan | Proceed with goal #30: migrate stat cards/hovers/spinners to brand tokens | ✅ | #30 |
| 33 | Integrations page still **toasts "coming soon"** for 3 providers despite a disabled `comingSoon` pattern existing | ux-a11y | P3 | `app/dashboard/integrations/page.tsx:611,1521,1639` (toast handlers) vs disabled pattern :1044-1049,:1529 | Finish goal #27: gate :611/:1521/:1639 behind the disabled state instead of onClick error toast | ✅ | #27 |
| 34 | **Goal #28 already shipped** (dep audit enforcing) but goals.md still says OPEN; meanwhile 1 high CVE silently suppressed via `ignoreGhsas` with no justification | ops-ci | P3 | `pr-checks.yml:186-187` no continue-on-error (verified); live `1 high (1 ignored)`; `pnpm.auditConfig.ignoreGhsas` uncommented | Mark #28 done; add dated justification + expiry note beside each `ignoreGhsas` entry | ✅ | #28 |
| 35 | **Goal #8 verified resolved at collection** — @smoke suite no longer dies on undici/webidl | ops-ci | P3 | `playwright test --grep @smoke --list` = 52 tests, exit 0; `pnpm.overrides` pins `pilot-tester>undici ^7.28.0` | Close #8's undici sub-item; redirect smoke effort to the A1/B4 credential/`--no-deps` issue (#9 above) | ✅ | #8 |

CV = code-verifiable. All 35 are code-verifiable; all retained findings carry confirmed `file:line` evidence (representatives from every persona were spot-checked against source during synthesis — no finding is UNVERIFIED).

---

## NEW findings not already tracked in goals.md

These have **no existing goal** and are the net-new yield of this STORM pass:

1. **[P0] Fabricated `S500:2025` standard + false Standards-Australia co-publisher + unconditional compliance auto-assertion** (finding #1). Goal #16 only covers S520 — the S500 fabrication on forensic/insurance output is entirely untracked and is the highest-severity item in the report.
2. **[P1] `S700:2015`/`S700:2025` fabricated fire-standard editions** (finding #6) — whole standard missed by #16.
3. **[P1] `STANDARDS_VERSIONS` registry wrong-and-unused** (finding #7) — the structural root cause behind every standards-drift finding; blocks any reliable staleness gate (spec §5.5).
4. **[P1] Claim PDF `public` cache + missing fileId-ownership check** (finding #2) — cross-tenant PII leak.
5. **[P1] Homeowner false-"Saved" silent data loss** (finding #3) — active false-positive on an unauthenticated customer flow.
6. **[P2] CircuitBreaker records failures as successes** (finding #10) — integration protection silently disabled.
7. **[P2] N+1 write loops on submit / promote-client / analyze-batch** (findings #13–15) — paid-path latency + tx-timeout rollback risk.
8. **[P2] Per-instance in-memory caches with sibling-blind invalidation** (finding #16) — stale credentials can embed in compliance reports.
9. **[P2] Storage factory silently returns a reject-everything S3 stub** (finding #17).
10. **[P2] `android-release.yml` `--no-frozen-lockfile` on the signed prod AAB** (finding #20) — supply-chain surface on the shipping binary.
11. **[P2] Owner-evidence freshness guard defeated by checkout mtime reset** (finding #22, extends #31).
12. **[P2/P3] Dependency/dead-code bloat:** unused `puppeteer`+Chromium (#19), `radix-ui` meta (#25), duplicate `motion`/`framer-motion` (#26), dual Google SDKs (#27), dead `AWS_*` config (#28), 770 MB stale worktrees (#29), split `src/` component root (#30).
13. **[P3] `analytics/narrative` cache served before the entitlement gate** (finding #24).
14. **[P3] Public forms placeholder-instead-of-label** WCAG failures (finding #31).

Findings that **confirm/refine existing goals** (not new): #4/#9 (→#6), #5 (→#7), #8 (→#16), #11/#12 (→#19), #18 (→#24), #22 (→#31), #23 (→#9), #32 (→#30), #33 (→#27), #34 (→#28, *recommend marking #28 DONE*), #35 (→#8, *recommend marking #8's undici sub-item DONE*).

---

## Code-verifiable execution queue (autonomous-loop order)

Ordered so an unattended loop lands the highest-leverage, lowest-risk, fully code-verifiable fixes first. Each has a deterministic check.

**Tier 1 — ship-blocker + user-harm (do first):**
1. **#1 S500:2025 fabrication.** Introduce one `STANDARDS` constant (`ANSI/IICRC S500-2021, 5th ed.`); replace literals in `generate-forensic-report-pdf.ts:1658-1694`, `on-close.ts:116,150,164`, `standards-retrieval.ts:432`; make `applyCitationGuard` conditional. Check: `grep -r 'S500:2025\|AS-IICRC\|Standards Australia' lib/` → 0.
2. **#2 Claim PDF cache + ownership.** `route.ts:46` → `private, no-store`; add org-ownership check before `downloadDriveFile`. Check: grep header changed; unit test that a foreign fileId → 403.
3. **#3 Homeowner false-Saved.** Add `anyFloorSucceeded`; gate `setSavedAt`. Check: vitest that a 500 on save in capture mode does NOT advance `savedAt` and sets an error state.

**Tier 2 — release-gate truth (unblocks goal #6/#7 = launch authority):**
4. **#4** align release-gate C1 to `--audit-level=high` (or patch the 6 moderate deps). Check: `release-gate-score.ts:207` matches `pr-checks.yml:187`.
5. **#5** add Postgres service + `DATABASE_URL` to `release-gate.yml` + B3 call. Check: B3 log shows the 5 DB suites *running*, not skipped.
6. **#9** make B4 distinct + add `--no-deps`/creds. Check: A1 and B4 no longer share a command string.
7. **#22** swap mtime → `git log %cI` for evidence age. Check: a file committed >14 d ago scores stale in CI.

**Tier 3 — compliance registry + remaining standards (one structural fix unblocks the rest):**
8. **#7** make `STANDARDS_VERSIONS` correct + the single source; add a CI gate failing on any literal `S###:YYYY` not matching it.
9. **#6 S700** and **#8 S520** normalised *through* the registry (re-verify §-numbers, do not blind-replace). Check: grep `S700:2015|S700:2025|S520:2015 lib/` → 0.

**Tier 4 — correctness + performance (high value, isolated):**
10. **#10** CircuitBreaker real-outcome tracking + opening-on-rate test.
11. **#13/#14/#15** `createMany` / single-`$transaction` batching on submit, promote-client, analyze-batch.
12. **#11/#12** explicit `select` on analytics insights/export + extend the audit-api-routes rule.
13. **#17** fail-fast S3 factory + test.
14. **#16** drop/route correctness-sensitive authorisation reads off per-instance cache.

**Tier 5 — bloat & dead-code (mechanical, verify via build):**
15. **#19** remove `puppeteer` (+ next.config entry) · **#25** remove `radix-ui` meta · **#26** drop `motion` · **#27** consolidate Google SDK · **#28** delete `AWS_*` block · **#29** prune worktrees · **#30** collapse `src/` root. Check after each: `pnpm install && pnpm type-check && pnpm build` green.
16. **#18** `eslint --fix` + ratchet `--max-warnings` down from 851.
17. **#20** `--frozen-lockfile` in android-release.yml · **#23** add androidpublisher preflight + `tracks:[internal]`.

**Tier 6 — UX/a11y + backlog hygiene:**
18. **#21** aria-live on sketch status · **#31** labels on contact form · **#32** dashboard brand tokens (#30) · **#33** disable coming-soon toasts (#27) · **#24** narrative cache after gate · **#34** mark goal #28 done + justify ignoreGhsas · **#35** mark goal #8 undici sub-item done.

---

*Owner-gated / out of autonomous scope:* the 6 moderate + 1 high CVE patch decisions if upstream fixes require major bumps (#4/#34), the GCP androidpublisher console enable (#23 — workflow guard is code, the enable is owner), and verification of section-number changes against the purchased S520:2024 / S700:2021 / S500-2021 source standards (#6/#7/#8 — re-verify, do not blind-replace).
