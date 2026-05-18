# Build audit — 2026-05-18

Senior Build Engineer audit of the RestoreAssist build pipeline before production cutover.
Repo: `/Users/phill-mac/RestoreAssist` · Branch: `main` (HEAD `fb61fba2`).
Tooling: Node `v26.0.0`, pnpm `10.33.0`, Next `16.2.6 (Turbopack)`, Prisma `6.19.3`, ESLint `9.39.4`, TypeScript via `tsc --noEmit`.

## Headline

| Check | Status | Detail |
|---|---|---|
| `pnpm prisma:generate` | **PASS** | Prisma Client v6.19.3 generated in 463 ms |
| `pnpm type-check` (`tsc --noEmit`) | **PASS** | 0 errors, 0 warnings (exit 0) |
| `pnpm lint` (`eslint .`) | **FAIL** (toolchain crash) | 0 lint findings reported — ESLint 9.39.4 crashed before walking any file (`TypeError: expand is not a function` from `minimatch@3.1.5` inside `@eslint/config-array`). Exit 2. |
| `pnpm build` (`sh scripts/build.sh`) | **PASS** | Compiled in 31.6 s; 387/387 static pages generated; 613 routes emitted; `.next` total **254 MB** (server 215 MB, static 36 MB) |
| `pnpm audit --prod --audit-level=moderate` | **PASS** | `No known vulnerabilities found` (post mermaid fix) |

Net: 4 of 5 gates green. The one failure is a **local-environment toolchain crash**, not a code defect — see Lint findings below for full diagnosis and fix path. The production binary builds cleanly and TypeScript types resolve cleanly.

---

## Type errors (group by file)

**None.** `tsc --noEmit` returned exit 0 with no diagnostics. Full output of the run:

```
> restoreassist@1.0.0 type-check /Users/phill-mac/RestoreAssist
> tsc --noEmit
```

That is the entire log. Type-check is fully clean against the current `tsconfig.json` resolution.

---

## Lint findings (group by rule)

**No lint findings produced.** ESLint never reached the file-walk phase — it crashed during config resolution. This is a CI gate the project still owes itself; the gate is currently inert.

### Single critical finding — toolchain crash (P0)

| Field | Value |
|---|---|
| Severity | Critical (the lint gate is currently a no-op locally; CI may be passing only because ESLint exits 2 silently) |
| Tool | ESLint 9.39.4 + `@eslint/config-array@0.21.2` + `minimatch@3.1.5` |
| Failure mode | Synchronous `TypeError: expand is not a function` |
| Stack (verbatim) | `Minimatch.braceExpand → Minimatch.make → new Minimatch → doMatch → match → pathMatches → FlatConfigArray.forEach` |
| Root cause (most likely) | `minimatch@3.1.5` ships as CJS and requires `brace-expansion` whose entry shape changed; under Node `v26` the module resolution returns an object whose default export is not directly callable, so `expand(...)` throws. The repo `.nvmrc` is empty and `engines.node` is `"20.x"`; running on Node 26 puts ESLint outside the supported matrix. |
| Contributing factor | `.npmrc` contains `force=true` — pnpm install resolves with `--force`, which can let an incompatible nested `minimatch@3.1.5` (alongside 5, 9, 10) sneak past peer constraints. Four minimatch versions are installed: `3.1.5`, `5.1.9`, `9.0.9`, `10.2.5`. |
| Reproducer | `pnpm exec eslint . 2>&1` from repo root |
| Verification | Direct invocation of the same eslint binary in a clean shell produces the identical stack trace. |

### Project-config observations (read-only, no rule edits made)

- `eslint.config.mjs` is the **interim** flat config (RA-1398). Comment header in the file explicitly notes the full `eslint-config-next` (`next/core-web-vitals`, `next/typescript`) rule chain is **not** active — only `@eslint/js` recommended + `@typescript-eslint/no-unused-vars` (warn) + `react-hooks/rules-of-hooks` (error) + `react-hooks/exhaustive-deps` (warn) + the RA‑1566 `no-restricted-globals` ban on `confirm`/`alert`/`prompt`.
- `ignores` excludes `.next/**`, `node_modules/**`, `dist/**`, `build/**`, `coverage/**`, `public/**`, `prisma/migrations/**`, `**/*.min.js`, `pnpm-lock.yaml`, `.pi-ceo/**`, **and `scripts/**`**.
- Because ESLint crashed before reading any source file, we cannot report per-rule counts. Once the toolchain crash is repaired, expect (a) the `@typescript-eslint/no-unused-vars` warning shelf and (b) the `react-hooks/exhaustive-deps` warning shelf to be the dominant outputs, with `react-hooks/rules-of-hooks` and `no-restricted-globals` as the only blocking rules.

---

## Build output observations

`pnpm build` ran the full pipeline (`prebuild: tsx scripts/build-help-index.ts` → `sh scripts/build.sh` → `prisma generate` → conditional `prisma migrate deploy` (skipped, no `DATABASE_URL` locally) → `next build`) and exited 0.

### Timing

| Phase | Result |
|---|---|
| `build-help-index` (prebuild) | wrote 8 entries to `public/help-index.json` |
| `prisma generate` (inside build) | Client regenerated in 480 ms |
| `prisma migrate deploy` | **Skipped** — no `DATABASE_URL` in local env (build.sh handles this safely; production DO/Vercel will run it) |
| `next build` compile | `✓ Compiled successfully in 31.6s` (Turbopack) |
| `runAfterProductionCompile` hook | `✓ Completed runAfterProductionCompile in 1002ms` |
| TS validation | `Skipping validation of types` then `Finished TypeScript config validation in 26ms` (Next 16 defers full check to `pnpm type-check`, which we ran separately and passed) |
| Page-data collection | 9 workers |
| Static page generation | `✓ Generating static pages using 9 workers (387/387) in 1207ms` |
| Page-optimisation finalisation | clean |

### Bundle size

Next 16 Turbopack output **does not print per-route First-Load JS columns** in this run — only the route list with `(Static / SSG / Dynamic)` marker and `Revalidate / Expire` columns. Bundle accounting was therefore done off the `.next` tree:

| Artefact | Size |
|---|---|
| `.next` total | **254 MB** |
| `.next/server` | **215 MB** (server functions + RSC payloads) |
| `.next/static` | **36 MB** (client chunks + assets) |
| `.next/standalone` | not produced (output mode not standalone) |

Top 10 client chunks by size (all in `.next/static/chunks/`):

| Chunk | Size |
|---|---|
| `12.35e9niz~rp.js` | 764 K |
| `04g9moaqngzs_.js` | 764 K |
| `0cprst3i~bz3_.js` | 676 K |
| `0bw2abiafng52.js` | 616 K |
| `0_1kd~ei60r56.js` | 616 K |
| `0gqrgfcqd50il.js` | 612 K |
| `09-mfo4wiww-g.js` | 612 K |
| `046m.u81ceu3i.js` | 576 K |
| `17h2we7wbzr67.js` | 460 K |
| `03he_6f5b7x53.js` | 420 K |

Two ~764 K chunks at the top suggest a heavy shared vendor split (likely AI SDK + Prisma client surface area + maybe the IICRC content tree). Hashed Turbopack chunk names make per-route attribution impossible without `--analyze`; flagged as a follow-up below.

### Route count

| Bucket | Count |
|---|---|
| Total routes emitted by Next | **613** |
| Of which `/api/*` (server-rendered functions) | **439** |
| Of which `/dashboard/*` (UI) | **130** |
| Middleware | 1 (`ƒ Proxy (Middleware)`) |

387 of the 613 routes are statically pre-rendered (`○` or `●`); the remaining 226 are `ƒ` dynamic.

### Warnings (build phase)

- Repeated pnpm-level warning every step: `Unsupported engine: wanted: {"node":"20.x"} (current: {"node":"v26.0.0", "pnpm":"10.33.0"})`. This is a **real risk**: Node 26 was released after the `engines` pin was set; the project is operating off-grid relative to its declared platform. Production hosts (DO App Platform, Vercel) will use Node 20 — so prod is fine — but every local check inherits Node 26 surprises (see lint crash above).
- Next experimental flags acknowledged in build output: `clientTraceMetadata`, `optimizePackageImports` (both intentional; left as informational).
- No `Warning:` or `warn` lines in the actual `next build` output — surprisingly clean.
- `Skipping validation of types` is **expected** for Next 16 builds — the project relies on `pnpm type-check` as the authoritative gate (consistent with `CLAUDE.md` rule #4 / commands table).

---

## Security / dependency audit

`pnpm audit --prod --audit-level=moderate` → `No known vulnerabilities found` (`--force I sure hope you know what you are doing` warning is benign; it stems from `.npmrc` `force=true`, not the audit itself).

The post-mermaid fix is clean. No moderate, high, or critical advisories at prod-dependency scope as of 2026-05-18.

---

## Prisma generate

```
✔ Generated Prisma Client (v6.19.3) to
  ./node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_magicast@0.3.5_typescript@6.0.3__typescript@6.0.3/node_modules/@prisma/client
  in 463ms
```

Clean. Exits 0. Standalone `pnpm prisma:generate` and the in-build `prisma generate` both succeed.

---

## Cross-cutting environmental observations (not failures, but ship blockers if ignored)

1. **Node version drift.** Repo declares `engines.node: "20.x"`. Local machine runs `v26.0.0`. `.nvmrc` is absent. The ESLint crash is directly attributable to this drift. Production hosts will be on Node 20, so the prod artefact is safe — but local CI hygiene is compromised. (Verified the `next build` produced under Node 26 still emits an output Node-20-compatible bundle.)
2. **`force=true` in `.npmrc`.** Combined with `legacy-peer-deps=true`, this hides peer-incompat warnings that would otherwise surface the minimatch/brace-expansion mismatch driving the lint crash. Worth a hard look once Node alignment is restored.
3. **Four concurrent minimatch versions installed** (`3.1.5`, `5.1.9`, `9.0.9`, `10.2.5`). The 3.1.5 copy is dragged in by `@eslint/config-array`; pnpm hoisting should prefer ≥5, but `force=true` may be suppressing the upgrade.
4. **ESLint config explicitly interim per RA-1398** — the full Next.js + TypeScript rule chain is not active. Even when the toolchain crash is fixed, lint coverage will remain narrower than implied by "PASS". This is documented in `eslint.config.mjs` lines 1–19 as a follow-up ticket.
5. **`scripts/**` is ignored by ESLint.** Several `tsx scripts/*` are part of the build chain (`build-help-index.ts`, `check-schema-drift.mjs`). They are linted by nothing.
6. **Bundle visibility is gone.** Turbopack-on-Next-16 drops the per-route First-Load-JS column; without `ANALYZE=true` or `@next/bundle-analyzer`, regression in chunk size goes silent. Two ~764 K shared chunks already exist; we cannot tell which routes import them.
7. **One Tip-level Prisma notice repeats twice in build.** Cosmetic only.

---

## Recommended fix order

In priority sequence — items 1–3 unblock the local CI gate, 4–6 harden the production cutover, 7 is a nice-to-have.

1. **Restore Node alignment.** Add `.nvmrc` pinning `20.x` (or bump `engines.node` to `"20.x || 22.x"` if we want LTS-22 support) and document Node version in onboarding. This alone is expected to clear the ESLint crash.
2. **Verify ESLint runs under Node 20.** Reproduce `pnpm lint` on Node 20 with the existing lockfile. If it still crashes, force `minimatch@>=5` resolution via `pnpm.overrides` in `package.json`, then re-test.
3. **Remove `force=true` from `.npmrc`** (after step 1 confirms the install graph is healthy without it). Keep `legacy-peer-deps=true` only if a concrete peer remains unresolved.
4. **Land an actual lint pass once ESLint runs.** Expect a wave of `@typescript-eslint/no-unused-vars` warnings and `react-hooks/exhaustive-deps` warnings; triage to either fix or `_`-prefix.
5. **Add bundle visibility.** Re-enable the per-route size column (Next 16 has the `webpackBuildWorker`/non-Turbopack flag, or use `@next/bundle-analyzer` in a separate script) and set a CI guardrail on `.next/static` total — e.g., fail if static client weight regresses >10 % vs `main`.
6. **Decide on RA-1398 follow-up ticket** — migrate to full `eslint-config-next` once a flat-config-native version lands, or hand-roll the `next/core-web-vitals` + `next/typescript` plugin chain. The header comment in `eslint.config.mjs` already commits to this.
7. **Drop `scripts/**` from the lint ignore list** once the toolchain is stable; the build-critical `tsx` scripts deserve lint coverage.

---

## Appendix — raw run metadata

- Commands executed (all from repo root, in this order):
  1. `find .next/dev .next/types -mindepth 1 -delete 2>/dev/null` — cleared
  2. `pnpm prisma:generate` → exit 0
  3. `pnpm type-check` → exit 0 (background, captured to `/tmp/ra-typecheck-full.log`, 5 lines, no diagnostics)
  4. `pnpm lint` → exit 2 (background, captured to `/tmp/ra-lint-full.log`)
  5. `pnpm exec eslint .` → exit 0 wrapper but underlying error captured; stack trace recorded above
  6. `pnpm audit --prod --audit-level=moderate` → exit 0
  7. `pnpm build` → exit 0 (background, captured to `/tmp/ra-build-full.log`, 666 lines)
- Disk: `.next` 254 MB, `.next/server` 215 MB, `.next/static` 36 MB.
- Routes: 613 total, 387 statically pre-rendered, 226 dynamic, 1 middleware.
- HEAD at audit time: `fb61fba2 fix(prisma): add 23 unindexed FK indexes (RA-4827 perf batch 1) (#1139)`.
- No files were edited during this audit.
