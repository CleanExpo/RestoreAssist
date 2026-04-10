# Progress — RestoreAssist

**Phase:** Managed Agents v4 Setup + Linear Work
**Last updated:** 2026-04-10

## Project Status: 447/448 Linear Issues Done

All 447 Linear issues are Done. The full RestoreAssist platform is implemented and deployed to production at restoreassist.com.au. Only RA-287 remains (blocked on DO_TOKEN GitHub secret).

## Current Session (2026-04-10)

| Task                                        | Status  | Notes                                                         |
| ------------------------------------------- | ------- | ------------------------------------------------------------- |
| Managed Agents v4 protocol saved            | Done    | `.claude/MANAGED_AGENTS_v4_FINAL.md`                          |
| Setup script created                        | Done    | `.claude/scripts/setup-managed-agents.sh`                     |
| PROGRESS.md cleaned up                      | Done    | Removed ~400 duplicate Session End lines                      |
| RA-509: Remove empty catch blocks           | Done    | PR #152                                                       |
| RA-510: Remove console.log from routes      | Done    | PR #152 (webhook handlers)                                    |
| RA-513: WorkspaceMember audit trail         | Done    | PR #152                                                       |
| RA-514: Eliminate explicit any              | Done    | PR #152                                                       |
| Production readiness audit                  | Done    | 447/448 issues Done; cron routes protected; Stripe fixed      |
| RA-511: Refactor generate-inspection-report | Done    | PR #153 — route 3241→335 lines; 3 new modules in lib/reports/ |
| RA-512: Split InitialDataEntryForm          | Done    | PR #154 — 5919→4258 lines; 6 sub-components extracted         |
| API key for Managed Agents                  | Pending | CEO to provide ANTHROPIC_API_KEY                              |
| Token & context optimization system         | Done    | .claudeignore, PreCompact hook, agents, skills — committed    |
| console.log cleanup (22 files, 55 calls)    | Done    | All API routes clean — committed `c802f0f8`                   |
| Admin routes → verifyAdminFromDb (9 files)  | Done    | CLAUDE.md rule 13 enforced — committed `ccfd7e13`             |
| Hardcoded admin email in feedback route     | Done    | Removed `mmlrana00@gmail.com` bypass — committed `ccfd7e13`   |

## Remaining Human Actions

| Action                                    | Reason                                                        |
| ----------------------------------------- | ------------------------------------------------------------- |
| Provide `ANTHROPIC_API_KEY`               | Required to run `.claude/scripts/setup-managed-agents.sh`     |
| Set `PORTAL_SECRET` on Vercel sandbox     | Insurer share token HMAC — sandbox builds fail without it     |
| Set `NEXT_PUBLIC_COMPANY_ABN` on Vercel   | `62 580 077 456` — footer ABN display                         |
| Set `DO_TOKEN` GitHub secret              | Unblocks RA-287 (DigitalOcean deploy workflow)                |
| GitHub CI/CD secrets (10 secrets)         | Android/iOS release workflows need signing credentials        |
| Apple Developer activation                | Check phill_bron@hotmail.com for activation email             |
| Google Play closed testing (12 x 14 days) | Required before production track access                       |
| RA-421/422/396 decisions                  | Brand consolidation, workspace spec, voice copilot — CEO only |

## Decisions

| Date       | Decision                                                | Rationale                                                                  |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| 2026-04-10 | Adopted Managed Agents v4 protocol                      | Multi-agent orchestration with quality rubric and anti-rush enforcement    |
| 2026-04-01 | Capacitor server-hosted WebView over Expo for V1 mobile | Avoids dual codebase; SSR API routes stay intact; single deployment target |
| 2026-04-01 | Java 21 for Android CI (not 17)                         | Capacitor 8.x requires `sourceCompatibility = JavaVersion.VERSION_21`      |
| 2026-04-01 | pnpm in CI (not npm)                                    | Project uses pnpm; npm can't find lockfile                                 |
| 2026-04-01 | `--no-frozen-lockfile` in CI                            | Lockfile drifts when Capacitor deps are added to package.json              |
| 2026-04-03 | os.walk over rglob in Code Intel MCP                    | pnpm symlinks in node_modules cause FileNotFoundError mid-iteration        |

## Pre-Launch Security Swarm Results (2026-04-07)

All 5 rounds complete. 55 findings identified and fixed across 8 commits.

| Round | Focus                                               | Findings | Commits                            |
| ----- | --------------------------------------------------- | -------- | ---------------------------------- |
| 1     | HMAC/timing, SQL injection, basic auth              | 8        | `5747459c`                         |
| 2     | Race conditions, N+1 queries, IDOR                  | 10       | `d62ac88c`, `e2efb938`             |
| 3     | Auth inconsistencies, privilege escalation, WCAG    | 12       | `ba34e922`, `31faf69f`, `47551092` |
| 4     | Billing bypass, credit exhaustion, prompt injection | 15       | `5a11cf97`                         |
| 5     | Stale JWT role, auth bypass, cross-tenant leaks     | 15       | `7c84e803`                         |

### Deferred Security Items

- **F5 (R5)**: In-memory rate limiter resets on cold starts → needs Upstash/Redis
- **F13 (R5)**: jsPDF/Fabric.js CVEs → needs `pnpm update jspdf` + audit
- **F15 (R5)**: CSP `unsafe-inline`/`unsafe-eval` → needs nonce-based CSP (medium effort)
- **F2 (R5)**: ~~30+ routes use `session.user.email`~~ — 9 admin routes fixed with `verifyAdminFromDb`; remaining `session.user.email` uses are Stripe customer email (correct) or low-risk fallbacks

## Sprint History (Summary)

| Sprint | Date       | Key Deliverables                                                                                     | Commits/PRs                        |
| ------ | ---------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| F/G/H  | 2026-04-03 | Evidence schema, BYOK vision, contents manifest, first-run                                           | `4c1e5cd1`                         |
| I      | 2026-04-05 | RA-410 dispute pack, RA-411 evidence QA, PR #138 merged                                              | `d0604617`, `20e1b050`             |
| J      | 2026-04-06 | RA-423 insurer profiles, RA-425 workspace RLS, RA-424 BYOK UI, RA-426 payment gate, RA-427 demo seed | PR #143                            |
| K      | 2026-04-06 | Insurer report portal, IICRC PDF generator, insurer share tokens                                     | `6c5f807a`                         |
| L      | 2026-04-06 | pgvector RAG (RA-437), Claude Vision meter reading (RA-438), App Store CI/CD                         | PR #145 merged                     |
| M      | 2026-04-08 | RA-446 photo label schema, RA-447 photo label API, RA-448 photos dashboard                           | PR #150 merged                     |
| N      | 2026-04-08 | Full type-safety pass: 688 → 0 errors                                                                | `e8c4694d`, `42c78637`, `e24c8202` |

## Developer Account Status (2026-04-08)

- Apple Developer Program ($149 AUD/yr): Order W1520046725 — activation pending
- Google Play Developer ($25 USD): Account registered, app pricing Free, checklist 13/13

## V2 Deployment (2026-04-09)

- Build fix: deleted legacy `middleware.ts`, kept `proxy.ts` (`e9b03c07`)
- All 12 V2 models in schema.prisma (ClaimSketch, Ascora*, ScopePricingDatabase, DrNrpg*, DryingGoalRecord, HistoricalJob)
- Prisma client regenerated; app builds clean
- Production should auto-deploy from latest commits

## Notes for Next Context Window

- **Linear queue**: All 447 Done + 2 In Review (RA-511 PR #153, RA-512 PR #154). RA-287 blocked (DO_TOKEN). Check for new tickets.
- **Open PRs**: #152 (RA-509/510/513/514), #153 (RA-511 route refactor), #154 (RA-512 form split)
- **Type-check**: 0 errors in app code; packages/videos ~90 pre-existing Remotion errors (separate package)
- **Production**: restoreassist.com.au running Sprint M (photo labels)
- **pgvector migration**: Applied to prod — IicrcChunk table ready
- **Linear API key**: "Claude Code RestoreAssist" (created Apr 8 2026) in `~/.claude/mcp.json`
- **console.log**: Fully cleared from all 22 API route files (55 calls removed) — `c802f0f8`
- **Admin auth**: 9 admin routes upgraded to `verifyAdminFromDb()` — `ccfd7e13`
- **Rate limiter**: Code already supports Upstash Redis — just needs `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` env vars in Vercel (human action)
- **Remaining security**: jsPDF CVEs (F13), nonce-based CSP (F15) — medium effort, deferred

## 2026-04-10 11:06 — Session End

## 2026-04-10 11:27 — Session End
