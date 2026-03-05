# CLAUDE.md — RestoreAssist v1.1

> Disaster restoration management platform: Next.js 15 + FastAPI/LangGraph + Supabase. Monorepo powered by pnpm + Turbo.

## Quick Commands

```bash
# Setup
pnpm run setup:windows      # Windows setup

# Development
pnpm dev                    # Start all services (web + backend)
pnpm run verify             # Health check
just --list                 # View all task runner commands

# Frontend only
cd apps/web && pnpm dev

# Docker
pnpm run docker:up          # Start PostgreSQL + Redis
pnpm run docker:down        # Stop services
pnpm run docker:reset       # Reset database

# Database
cd apps/web && npx prisma studio     # Prisma Studio
pnpm run migrate                     # Run migrations

# Quality
pnpm turbo run test         # All tests
pnpm turbo run lint         # Linting
pnpm turbo run type-check   # Type checking

# Skill Manager
/skill-manager analyse      # Analyse skill gaps
/skill-manager generate X   # Generate new skill

# Browser Automation
/ui-review run              # Execute UI stories via Playwright
/automate-browser <task>    # Ad-hoc browser automation
```

## Architecture Routing

| What | Where |
|------|-------|
| Frontend (Next.js 15, React 19, Tailwind v4) | `apps/web/` |
| Backend (FastAPI, LangGraph) | `apps/backend/` |
| Shared types & utils | `packages/shared/` |
| ESLint / TS configs | `packages/config/` |
| App pages & routes | `apps/web/app/` |
| Reusable components | `apps/web/components/` |
| Client utilities | `apps/web/lib/` |
| React hooks | `apps/web/hooks/` |
| Prisma schema | `apps/web/prisma/schema.prisma` |
| Auth middleware | `apps/web/middleware.ts` |
| AI agents | `apps/backend/src/agents/` |
| FastAPI routes | `apps/backend/src/api/` |
| Database schema | `scripts/init-db.sql` |
| Design tokens | `apps/web/lib/design-tokens.ts` |
| Playwright config | `apps/web/playwright.config.ts` |

## Key Features (RestoreAssist)

- Restoration job management (clients, jobs, invoices)
- Contractor quoting tool with NRPG rate boundaries
- AI-powered document processing
- Supabase + Prisma database layer
- PDF invoice generation
- Role-based access control

## Knowledge Retrieval

| Source | Use For | Access |
|--------|---------|--------|
| **Context7 MCP** | Library docs (Next.js, FastAPI, Prisma, etc.) | `resolve-library-id` → `get-library-docs` |
| **Skills** | Pattern libraries | `.skills/custom/*/SKILL.md` |

Full skill registry: `.skills/AGENTS.md`

## Environment Variables (Required)

```bash
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# AI
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx

# Backend
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

See `.env.example` for full list.

## Design System — Scientific Luxury

| Element | Implementation |
|---------|---------------|
| Background | OLED Black (`#050505`) |
| Borders | `border-[0.5px] border-white/[0.06]` |
| Corners | Sharp only (`rounded-sm`) |
| Typography | JetBrains Mono (data), Editorial (names) |
| Animations | Framer Motion only |
| Layout | Timeline/orbital |

**Spectral colours**: Cyan `#00F5FF` (active), Emerald `#00FF88` (success), Amber `#FFB800` (warning), Red `#FF4444` (error)

Full system: `docs/DESIGN_SYSTEM.md` | Skill: `.skills/custom/scientific-luxury/SKILL.md`

## Agents & Skills

- **23 subagents**: `.claude/agents/*/agent.md`
- **59 skills**: `.skills/AGENTS.md` (full registry)
- **10 commands**: `.claude/commands/*.md`
- **Orchestrator**: `.claude/agents/orchestrator/agent.md`

## Documentation

| Document | Purpose |
|----------|---------|
| [`PROGRESS.md`](PROGRESS.md) | Project status |
| [`PRODUCT-ROADMAP.md`](PRODUCT-ROADMAP.md) | Product roadmap |
| [`docs/LOCAL_SETUP.md`](docs/LOCAL_SETUP.md) | Setup guide |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Design system |
| [`docs/MULTI_AGENT_ARCHITECTURE.md`](docs/MULTI_AGENT_ARCHITECTURE.md) | Agent workflow |
