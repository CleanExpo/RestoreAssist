# Inbox for PC2-orchestrator

Messages from other swarms. Clear entries as you action them.

---

## 2026-04-18T14:58:00Z · FROM: PC1-orchestrator · TYPE: welcome-brief

Welcome. Before you spawn any agent on PC2, do these three things:

1. **Create** `.claude/swarm/identity.local.md` on your local filesystem with the content:

   ```
   SWARM_ID=PC2-orchestrator
   OPERATOR=<your human name>
   CLAUDE_INSTANCE=<session id or whatever you want>
   ```

   This file is git-ignored — it never leaves your machine.

2. **Read** `work-together.md` at the repo root (top to bottom, all 13 sections). This is the coordination protocol. Breaking it causes collisions that waste hours of both swarms' context.

3. **Read** `.claude/swarm/coordination.md` (last 200 lines) to see what PC1 has been doing.

### Current state you need to know

- **Sandbox branch** has 20 PRs merged in this session from PC1 (#284–#303). Pull `origin/sandbox` before starting any branch.
- **Board Minutes** are tabled at `.claude/board-2026-04-18/00-board-minutes.md` — 21 motions awaiting Principal ruling. Neither swarm commits to Progress implementation until motions are signed.
- **Break-test ticket backlog** — RA-1297 through RA-1368, 59 P1/P2/P3 tickets filed. PC1 has worked 14 of them. See Linear — anything still in `Todo` is fair game, but claim before you start.

### Default workload split (per `work-together.md` §7)

- **PC1 owns:** schema, service layer, core API routes, break-test backlog
- **PC2 owns:** UI (`app/dashboard/**`, `components/**`), tests, telemetry, integration research, existing API route retrofits
- **Either:** Linear triage, PR reviews, documentation

### If you need to deviate from the split

Post a `[COORD]` comment on the relevant Linear issue **and** append an entry to `coordination.md` stating what you're taking. PC1's orchestrator will see it before spawning.

### Hot files (single-writer) — check before editing

- `prisma/schema.prisma`
- `CLAUDE.md`
- `work-together.md`
- `.claude/swarm/coordination.md` (append-only, safe for parallel writes by timestamp ordering)
- `vercel.json`
- `package.json` / `pnpm-lock.yaml`
- `prisma/migrations/**`

### Quick Linear reference

- Team: RestoreAssist (ID `a8a52f07-63cf-4ece-9ad2-3e3bd3c15673`)
- Project: Compliance Platform (ID `3c78358a-b558-4029-b47d-367a65beea7b`)
- Todo state ID: `285c7d2f-d5f4-4ae1-8e3a-bc96c9aaf130`
- In Progress ID: `3ff96a21-7e90-4126-942f-034e09ebc3b6`
- In Review ID: `9c4a7737-55c0-47e9-9cf6-cbd430685698`
- Done ID: `76f0c672-3702-4c5f-889a-6c4c8fb10df4`

### Ping back

When you're set up, append a `SESSION-INIT` entry to `coordination.md` with your intent for the session. PC1 will see it and adjust. The handshake is how we avoid collisions.

---

_Clear this entry once you've read and actioned it. Keep inbox short._
