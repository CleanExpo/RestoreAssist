# RestoreAssist

Australian water-damage restoration platform — **Next.js App Router**, TypeScript, Prisma.

## Root layout (what belongs here)

| Path | Role |
|------|------|
| `app/` | Routes, API handlers, layouts |
| `components/` | React UI |
| `lib/` | Domain logic, auth, integrations |
| `hooks/` | Client hooks |
| `types/` | Shared TypeScript types |
| `prisma/` | Schema and migrations (deploy SSOT) |
| `public/` | Static assets |
| `data/content/` | Runtime help, training, nexus-hub (`@/content/*`) |
| `config/` | ESLint, Vitest, Playwright, Lighthouse |
| `scripts/` | Build, CI, ops, agent evals |
| `e2e/` | Playwright end-to-end specs |
| `docs/` | Specs, ADRs, project notes, intents |
| `mobile/` · `ios/` · `android/` | Mobile shells (Expo / Capacitor) |
| `packages/` | Workspace packages (e.g. pilot-tester) |
| `tools/` | Remotion and local video output |
| `ops/` | Store metadata (fastlane) |
| `docker/` | Container build context |

**Instruction files (root only):** `README.md`, `AGENTS.md` (Next.js agent rules), `CLAUDE.md` (engineering rules), `spec.md` (canonical product spec — CI guard).

**Not at root:** long-form backlog, changelogs, review rubrics → `docs/project/`. New product intents → `docs/intent/`.

Env template: `.env.example`.

## Commands

```bash
npm ci
npm run dev
npm run type-check
npm run lint
npm run test:unit
npm run build
```

## Docs

- Release gate: [docs/RELEASE_GATE.md](docs/RELEASE_GATE.md)
- Root cleanup history: [docs/ROOT_CLEANUP_REPORT.md](docs/ROOT_CLEANUP_REPORT.md)
- Product backlog (moved from root): [docs/project/BACKLOG.md](docs/project/BACKLOG.md)
