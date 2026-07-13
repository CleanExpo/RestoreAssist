# RestoreAssist

TypeScript / Next.js 15 App Router compliance platform for Australian water damage restoration.

## Layout

```
app/           Next.js App Router
components/    UI
lib/           Domain / server logic
prisma/        Schema + migrations (deploy SSOT)
public/        Static assets
scripts/       Build / ops
config/        ESLint, Vitest, Playwright, Lighthouse
docs/          Long-form docs
data/content/  Help, training, video scripts (runtime)
tools/         Remotion video pipeline + local render output
packages/      Workspace packages (pilot-tester)
ops/           Release ops (fastlane metadata)
mobile/        Expo
ios/ android/  Capacitor shells
```

Playwright e2e lives under `docs/archive/playwright-e2e/` (not at repo root).

Env template: `.env.example`.

## Commands

```bash
pnpm install
pnpm dev
pnpm type-check   # authoritative
pnpm lint
pnpm test:unit
pnpm test:smoke
pnpm build
```

## Docs

- Release gate: `docs/RELEASE_GATE.md`
- Root cleanup: `docs/ROOT_CLEANUP_REPORT.md`
