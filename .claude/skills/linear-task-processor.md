---
name: linear-task-processor
description: >
  Use this skill when the user says "pick up the next Linear task", "work through the backlog",
  "continue with Linear", "what's next in Linear", "implement RA-XXX", or any variation of
  wanting to autonomously work through Linear issues end-to-end. This skill covers the full
  cycle: read issue → plan → implement → type-check → commit → mark Done. Use it even if the
  user just says "keep going" or "continue" in the context of a Linear backlog session.
  IMPORTANT: invoke this skill before starting any Linear-driven implementation work.
---

# Linear Task Processor — Autonomous Implementation Loop

This skill enables end-to-end autonomous processing of Linear issues for RestoreAssist:
read → plan → implement → verify → commit → close. Run this loop without stopping to ask
for permissions unless a prohibited action (financial, credentials, sharing) is encountered.

## Setup constants (memorise these)

- **Linear API key**: `$LINEAR_API_KEY` (set in `~/.claude/settings.json` env)
- **RA team Done state UUID**: `76f0c672-3702-4c5f-889a-6c4c8fb10df4`
- **RA team In Progress UUID**: `3ff96a21-7e90-4126-942f-034e09ebc3b6`
- **Linear GraphQL endpoint**: `https://api.linear.app/graphql`
- **Auth header**: `Authorization: $LINEAR_API_KEY`
- **Project root**: `D:/RestoreAssist`
- **Branch**: `sandbox`

## Phase 1 — Select the issue

### Fetch the backlog

```bash
curl -s --ssl-no-revoke -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issues(filter: { team: { key: { eq: \"RA\" } }, state: { name: { in: [\"Todo\", \"Backlog\"] } } }, first: 20, orderBy: priority) { nodes { id identifier title priority description state { name } } } }"}'
```

### Prioritise what to work on

Pick the highest-priority issue that:

1. Requires code changes (skip founder-action items like "confirm pilot companies" or "write requirements doc")
2. Has enough description to start implementation
3. Is not blocked by an unresolved dependency

If no actionable code issue exists, tell the user and list what IS in the backlog (including founder-action items they may want to address).

### Mark In Progress

```bash
# Get issue UUID first (replace RA-XXX with identifier)
ISSUE_UUID=$(curl -s --ssl-no-revoke -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issue(id: \"RA-XXX\") { id } }"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['issue']['id'])")

curl -s --ssl-no-revoke -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { issueUpdate(id: \\\"$ISSUE_UUID\\\", input: { stateId: \\\"3ff96a21-7e90-4126-942f-034e09ebc3b6\\\" }) { success } }\"}"
```

## Phase 2 — Understand the issue

Before writing a single line of code:

1. **Read the full issue description** — extract: what it does, acceptance criteria, any referenced files or patterns
2. **Read ARCHITECTURE.md** if the issue involves new models, routes, or services
3. **Read the relevant source files** — always read before modifying (never assume structure in a 120+ model codebase)
4. **Check for related issues** — if the description references other RA tickets, fetch them too
5. **Run `git log --oneline -5`** to understand recent context

## Phase 3 — Plan before coding

For any issue touching > 3 files, write a brief plan inline before starting:

- What files to create/modify
- What schema changes are needed (Prisma migration?)
- What the commit will contain

For simple issues (< 3 files, clear from description), go straight to implementation.

## Phase 4 — Implement

### Rules (apply always, without stopping to ask)

- Auth check (`getServerSession`) on every new API route — no exceptions
- Use `include`/`select` on every Prisma query — never unbounded `findMany`
- Use shadcn/ui components from `components/ui/` — never create custom form controls
- Follow existing file/folder patterns in the codebase
- If adding a Prisma model: apply migration via Supabase MCP to both prod (`udooysjajglluvuxkijp`) and sandbox (`oxeiaavuspvpvanzcrjc`)

### Supabase MCP migration pattern (for schema changes)

```
mcp__9d9ff51d-2b8f-4dc6-b420-01836cda0c98__apply_migration({
  project_id: "udooysjajglluvuxkijp",  // prod
  name: "descriptive_migration_name",
  query: "-- SQL here"
})
// repeat for sandbox: oxeiaavuspvpvanzcrjc
```

Then create the local migration file at `prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql`.
Then run: `cd D:/RestoreAssist && prisma generate`

## Phase 5 — Verify

After implementation, always run in this order:

```bash
# 1. Type-check the files you changed (fast)
cd D:/RestoreAssist && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -v node_modules | head -30

# 2. If schema changed, validate
npx prisma validate

# 3. Run related unit tests if they exist
npx vitest run <relevant-test-file> 2>&1 | tail -20
```

Fix any type errors before committing. If a type error is in pre-existing code unrelated to the current issue, note it but do not block the commit.

## Phase 6 — Commit

Stage only the files changed for this issue:

```bash
cd D:/RestoreAssist && git add <specific files only — never git add -A>
git commit -m "$(cat <<'EOF'
feat|fix|chore(<scope>): RA-XXX short description

Longer explanation of what changed and why (if needed).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

## Phase 7 — Mark Done in Linear

```bash
curl -s --ssl-no-revoke -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { issueUpdate(id: \\\"$ISSUE_UUID\\\", input: { stateId: \\\"76f0c672-3702-4c5f-889a-6c4c8fb10df4\\\" }) { success issue { identifier state { name } } } }\"}"
```

## Phase 8 — Update PROGRESS.md

Add a row to the Active Tasks table:

```markdown
| RA-XXX description | Done | Committed `<short-hash>` — brief description |
```

## Loop continuation

After completing one issue, check if there are more actionable items in the backlog. If yes
and the user has said "work through the backlog" or similar, pick up the next one without
asking — just announce which issue you're starting. If the user said "do the next one" (singular),
stop after completing it and report what was done.

## When to stop and ask

Stop and check with the user only if:

- The issue description is too vague to implement safely
- Implementation requires a decision between two significantly different architectures
- A prohibited action is needed (financial data, sharing permissions, account creation)
- A type error or test failure cannot be resolved without understanding the user's intent
- The issue references external services/credentials that aren't in `.env.local`

In all other cases, use your best judgment and implement — the user can always revert a git commit.

## Efficiency tips

- Run type-check on just changed files first (faster): `npx tsc --noEmit path/to/changed/file.ts`
- Use Supabase MCP for migrations instead of fighting broken `prisma migrate dev`
- Read files before editing — the codebase is large and assumptions break things
- Check `git log --oneline -10` at start to understand what's already been done
