# Service Layer Architecture — Margot deep-research synthesis (2026-05-18)

Source: `mcp__margot__deep_research_max` interaction `v1_ChdWMWtLYXNDb0Q5ak1qdU1QdzdhUGdBWRIXVjFrS2FzQ29EOWpNanVNUHc3YVBnQVk`.

Key inputs folded into `.claude/skills/service-layer-architecture/SKILL.md`:
- 3 verbatim Ondrej quotes (Decorate-with-Convex May 2025, Next.js 16 RSC, Anthropic Agent SDK Feb 2026).
- Saga compensation pattern for cross-system rollback (action-layer concern, not service).
- Confirmation that "dispatcher runtime setup / readiness probes / teardown helpers" jargon is NOT verbatim Ondrej — synthesised from enterprise patterns. The skill now flags this explicitly.

Theoretical roots affirmed by Margot:
- Convex Actions runtime model (Node vs V8 isolate).
- Hexagonal Architecture — Ports & Adapters (Cockburn).
- Domain-Driven Design — Application vs Domain Services (Vernon).
- Clean Architecture — Use-Case Interactors (Martin).

Cross-stack mappings validated for: Next.js App Router + Prisma + Supabase, Python FastAPI + Pydantic + SQLAlchemy.

The full 4,500-word report is in the Margot interaction record; only the load-bearing snippets are reproduced here. Re-fetch with `mcp__margot__check_research` if needed.
