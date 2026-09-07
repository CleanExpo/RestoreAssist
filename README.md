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
e2e/           Playwright end-to-end specs
data/content/  Help, training, video scripts (runtime)
tools/         Remotion video pipeline + local render output
packages/      Workspace packages (pilot-tester)
ops/           Release ops (fastlane metadata)
mobile/        Expo
ios/ android/  Capacitor shells
```

Playwright e2e lives under `e2e/` at the repo root.

Env template: `.env.example`.

## Commands

```bash
npm ci
npm run dev
npm run type-check   # authoritative
npm run lint
npm run test:unit
npm run test:smoke
npm run build
```

## Docs

- Release gate: `docs/RELEASE_GATE.md`
- Root cleanup: `docs/ROOT_CLEANUP_REPORT.md`
