# RestoreAssist Aggregation — All sources in one place

**Built:** 2026-05-18

This folder consolidates every information source about RestoreAssist into a single navigable structure, so the steps and stages required to finish the application can be reasoned about as a whole.

## Where to start

1. **`MASTER_PLAN.md`** — the synthesised "where we are + what's left + dependency graph + critical path."
2. Drill into individual sources when the master plan references them.

## Sources pulled

| File | What's in it | Lines |
|---|---|---|
| `MASTER_PLAN.md` | Synthesised roadmap: 9 stages, critical path, immediate next actions | ~300 |
| `linear/inventory.md` | Linear team (`RestoreAssist`), projects, milestones, all open P0/P1 issues | ~120 |
| `pi-ceo/inventory.md` | Pi-CEO board records, specs, RA charter, runbooks, n8n workflows (26 unique artifacts) | 236 |
| `wiki/inventory.md` | 2nd Brain wiki — canonical RA pages, decisions, log entries, extracted roadmap candidates | 410 |
| `hermes/inventory.md` | Hermes routines, cron jobs (13 RA-related), launch agents, business charter, health assessment | 193 |
| `vercel/state.md` | Vercel project, 20 latest deploys, 81 env-var names (no values), domains, hygiene flags | 220 |
| `github/state.md` | `CleanExpo/RestoreAssist` repo, 0 open PRs, 50+ merged PRs last 30d, branches, commits | 253 |
| `supabase/state.md` | Both RA Supabase projects, **🚨 119 tables RLS-disabled in prod**, migrations, edge functions | ~140 |
| `sources/repo-state.md` | Local repo: branch state, `.claude/PROGRESS.md` corruption, `.claude/` layout, route counts | 249 |

## Top findings (in order of urgency)

1. 🚨 **Supabase RLS disabled on 119 of ~180 prod tables.** Anyone with the anon key (which Next.js ships to the client) can read or modify production data. No Linear issue exists yet for this. Open as P0 sub-task of RA-4956.
2. 🟠 **`NODE_TLS_REJECT_UNAUTHORIZED` set in Vercel Production env (50d).** Disables TLS verification. Audit immediately.
3. 🟠 **Production go-live gate RA-4956 is `Ready for Pi-Dev`** — five P0/P1 sub-issues (RA-4951/4952/4853/4954/4955) feed it. Until those close, "production-ready" is unsupported.
4. 🟠 **Xero stability sprint is 0% with 33-day deadline (2026-06-20, ATO EOFY).** Hard date.
5. 🟠 **`deploy-production.yml` GitHub Action broken since 2026-04-25** — CI prod deploys haven't fired in 23 days. Either fix or delete.
6. 🟢 **Pilot cutover (RA-1718) is owner-action-gated** — runbook ready; soft-launch ticket (RA-1723, Beyond Clean recommended) hasn't been picked up.
7. 🟢 **App Store / Play Console unblock pending since 2026-04-08** — DUNS confirmed, do not create a new account, escalate existing one.
8. 🟢 **Local `.claude/PROGRESS.md` is corrupted** — 100+ empty "Session End" stamps from a misbehaving commit hook. Don't trust it as a status source; use `git log` + Linear.

## How to refresh this aggregation

Re-run the parallel-pull pattern from a fresh session:
- Linear MCP for issues + projects (paginate by team)
- Supabase MCP for projects, tables, advisors, migrations
- Vercel CLI for deployments, env-var names, domains
- `gh` CLI for PRs, issues, runs
- `git log` for commit history
- Explore agents over `~/Pi-CEO`, `~/2nd Brain`, `~/.hermes`

Then re-synthesise into `MASTER_PLAN.md`. Goal: one source of truth per source folder, one synthesis file at the top.
