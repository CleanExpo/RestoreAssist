# Root cleanup report

**Date:** 2026-07-12 (pass 2 — production-grade prune)  
**SSOT decision:** Flat Next.js App Router at repo root. One canonical `prisma/`. No `web/` package.

## Pass 2 — removed / relocated after reference check

### Deleted (confirmed unused)

| Path | Why |
|------|-----|
| `.bin/` | Dead wrapper (`video-pre-flight`) — zero refs |
| `supabase/.temp/` | Tracked CLI cache junk |
| Root `.DS_Store` | OS clutter |

### Relocated

| From | To | Why |
|------|----|-----|
| `__tests__/restoreassist/scope-quality-evaluator.test.ts` | `lib/ai/__tests__/scope-quality-evaluator.test.ts` | Orphan — not in Vitest include at root |
| `src/components/brand/*` | `components/brand/*` | Fold into app UI tree |
| `src/brand/.../icon-registry.ts` | `lib/brand/icon-registry.ts` | Domain helper, not a second app root |
| `vendor/` | `docs/tooling/vendor-opensrc/` | Reference-only opensrc CLI source |
| `.au-english.json` | `config/au-english.json` | Tooling config |
| `test/rls/` | `scripts/rls-harness/` | Ops harness belongs under scripts |

### Path updates

- Brand imports: `@/components/brand/*`, `@/lib/brand/icon-registry`
- `scripts/check-au-english.mjs` reads `config/au-english.json` (legacy `.au-english.json` still accepted)
- CI `rls-isolation.yml` → `scripts/rls-harness`
- `pnpm-workspace.yaml`: dropped dead `packages/*` (no `packages/` dir)
- `tsconfig` / ESLint ignores: `docs/tooling/vendor-opensrc/**`
- Agent docs: opensrc path → `docs/tooling/vendor-opensrc/`

## Intentionally kept at root (still live)

| Path | Why not removed |
|------|-----------------|
| `supabase/migrations/` | CI RLS audits + harness apply these; **not** deploy SSOT (Prisma is), but deleting without porting 15 supabase-only policies would break security gates |
| `pilot-tester/` | Workspace package; `pilot-canary.yml` |
| `remotion/` + `remotion.config.ts` | Marketing/tutorial video pipeline (`render:tutorials`) |
| `content/` | Runtime prompt/training/help inputs |
| `e2e/`, `playwright/` | Playwright specs + auth state dir |
| `fastlane/metadata` | Play Store listing assets |
| `videos/.gitkeep` | Local render output stub |
| `.agents/`, `.codex/` | Cursor/Codex toolchain (`.codex/` gitignored for secrets) |
| `mobile/`, `ios/`, `android/`, `capacitor.config.ts` | Mobile product |

## Earlier pass 1 (docs/config consolidation)

Root markdown, `MISSION_REPORTS`, `PROJECTS`, `distribution`, `frontdesk`, `prompts`, `.harness`, `.planning`, etc. → under `docs/`. ESLint/Vitest/Playwright/Lighthouse → `config/`.

## Verification

| Check | Result |
|-------|--------|
| Root scannable | Pass — no `src/`, `vendor/`, `test/`, `__tests__/`, `.bin/` |
| `pnpm lint` | Pass — 0 errors (warnings under budget) |
| Vitest (relocated evaluator) | Pass |
| `pnpm type-check` | Pass — also fixed nullable `useSearchParams`/`useParams` + `VALIDATION` code |

## Do not delete without a porting plan

`supabase/migrations` → fold into Prisma first, then shrink. `pilot-tester` / `remotion` / `content` are product or CI surfaces.

## Pass 3 — remove root `supabase/`

| Action | Detail |
|--------|--------|
| Moved | `supabase/migrations/` → `docs/ops/supabase-migrations-archive/` |
| Deleted | Empty root `supabase/` |
| Updated | `scripts/audit-rls*.ts`, `scripts/rls-harness/run.sh` paths |
| Kept | `@supabase/supabase-js` runtime client (`lib/supabase.ts`) — hosted API, not the folder |


## Pass 4 — root IA (content / remotion / e2e / fastlane / pilot-tester)

| From | To |
|------|----|
| `content/` | `data/content/` (`@/content/*` alias) |
| `remotion/` + config | `tools/remotion/` |
| `pilot-tester/` | `packages/pilot-tester/` |
| `e2e/` + `playwright/` | `tests/e2e/`, `tests/playwright/` |
| `fastlane/` | `ops/fastlane/` |
| `videos/` | `tools/videos/` |

Root now reads as a normal Next.js + Prisma app; secondary trees live under `data/`, `tools/`, `packages/`, `tests/`, `ops/`.

## Pass 5 — remove root `tests/`

Moved Playwright suite to `docs/archive/playwright-e2e` (auth dir alongside). Root no longer has a `tests/` folder. **pnpm stays** — it is the required package manager for this repo.

## Pass 6 — remove agent/env clutter

Deleted: `AGENTS.md`, `CLAUDE.md`, `.vercelignore`, `.nvmrc`, `.env.test.local.example`, `.claudeignore`, `.agents/`.
No `pnpm/` directory existed; kept `pnpm-lock.yaml` / `pnpm-workspace.yaml` (package manager).

## Pass 7 — remove `pnpm-workspace.yaml`

Deleted workspace file. Kept `pnpm-lock.yaml`. Pilot package runs standalone under `packages/pilot-tester/`.

## Pass 8 — remove `pnpm-lock.yaml` + package.json pnpm config

Deleted root and `mobile/pnpm-lock.yaml`. Removed `pnpm.overrides` / `auditConfig` and `packageManager` from `package.json`. App `dependencies` / `devDependencies` kept.
