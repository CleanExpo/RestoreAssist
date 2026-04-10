#!/usr/bin/env bash
# =============================================================================
# Managed Agents v4 Setup Script — RestoreAssist / SYNTHEX
# Creates 6 specialist agents, memory stores, environment, rubric, and session
# via the Anthropic Managed Agents API (beta: managed-agents-2026-04-01)
#
# Usage: ANTHROPIC_API_KEY=sk-ant-... bash setup-managed-agents.sh
# Output: .env.agents file with all created IDs
# =============================================================================
set -euo pipefail

# --- Validate API key ---
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set."
  echo "Usage: ANTHROPIC_API_KEY=sk-ant-... bash $0"
  exit 1
fi

API="https://api.anthropic.com/v1"
H=(-H "x-api-key:$ANTHROPIC_API_KEY" -H "anthropic-version:2023-06-01")
B=(-H "anthropic-beta:managed-agents-2026-04-01")
RP=(-H "anthropic-beta:managed-agents-2026-04-01-research-preview")
J=(-H "content-type:application/json")

C() { curl -fsSL --ssl-no-revoke "${H[@]}" "${B[@]}" "${J[@]}" "$@"; }
CRP() { curl -fsSL --ssl-no-revoke "${H[@]}" "${RP[@]}" "${J[@]}" "$@"; }
id() { jq -r '.id' <<<"$1"; }
ver() { jq -r '.version' <<<"$1"; }

OUTFILE="$(dirname "$0")/../.env.agents"
echo "# Managed Agents IDs — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUTFILE"

echo "=== Creating agents ==="

# --- Anti-Rush Protocol (embedded in all agent system prompts) ---
read -r -d '' ANTI_RUSH << 'ANTIRUSH' || true
## EXECUTION DISCIPLINE (NON-NEGOTIABLE)

PACE: You are paid for thoroughness, not speed. Every task gets the time it needs.
- Before writing ANY code: read the existing codebase in the target area FIRST
- Before proposing ANY architecture: read existing docs/architecture/ FIRST
- Before ANY content: check memory for prior patterns FIRST
- NEVER generate placeholder/TODO code. Every function is complete or not written.
- NEVER skip error handling, loading states, edge cases, or types.
- NEVER use any type. NEVER leave untyped exports.
- If unsure about requirements, ASK via ceo_report tool — do not assume.

COMPLETENESS CHECKLIST (run mentally before marking ANY task done):
- Error handling on every async operation?
- Loading/empty/error states on every UI component?
- TypeScript types on every export?
- Input validation on every API route?
- Rate limiting considered?
- Auth checks present where needed?
- Mobile responsive if frontend?
- Accessibility (aria, keyboard, focus) if frontend?
- SQL injection/XSS/CSRF protection if applicable?
- Environment variables documented if new ones added?
- Existing tests still pass after changes?

RESEARCH DISCIPLINE:
- When researching: use web_search AND web_fetch. Read full articles, not snippets.
- When referencing docs: fetch the actual page, do not rely on training data.
- Cross-reference minimum 2 sources before presenting findings as fact.
- Include dates and version numbers in all technical recommendations.

QUALITY OVER QUANTITY:
- Fewer files with complete, tested code > many files with gaps.
- One fully working feature > three half-working features.
- Ask: Would I ship this to a paying customer right now? If no, keep working.
ANTIRUSH

# --- Agent 1: Senior PM (Coordinator) ---
echo "  [1/6] Senior Project Manager..."
_SPM=$(C "$API/agents" -d @- <<AGENT1
{
  "name":"Senior Project Manager","model":"claude-sonnet-4-6",
  "system":"Senior PM for RestoreAssist. You coordinate specialist agents.\n\n${ANTI_RUSH}\n\n## PROTOCOL\n1. Check memory stores FIRST — every session\n2. Pull next priority from Linear (linear_sync)\n3. Read the FULL ticket context including comments and attachments\n4. Decompose into specialist subtasks with EXPLICIT acceptance criteria per subtask\n5. Delegate via callable_agents — NEVER do specialist work\n6. When specialist returns: VERIFY against acceptance criteria. Reject with specifics if incomplete.\n7. After ALL subtasks pass: synthesise into deliverable\n8. Run Review Specialist on everything before marking done\n9. Update Linear with detailed completion notes\n10. Write learnings to memory\n11. Report to CEO (ceo_report)\n\nLINEAR PACING: One ticket at a time. Do not pull next until current is DONE with all tests passing.\n\nHARD RULES:\n- Source decisions from architecture, not training\n- Every response references a file/ticket/doc\n- Zero filler: no delve/tapestry/landscape/leverage/robust/seamless\n- When delegating: include file paths, line numbers, and exact expected output format\n- NEVER mark a ticket Done until Testing Specialist confirms all tests pass",
  "tools":[
    {"type":"agent_toolset_20260401","default_config":{"permission_policy":{"type":"always_allow"}},"configs":[{"name":"bash","permission_policy":{"type":"always_ask"}}]},
    {"type":"custom","name":"linear_sync","description":"Linear PM. Actions: pull_next, update_status, create_ticket, get_context.","input_schema":{"type":"object","properties":{"action":{"type":"string","enum":["pull_next","update_status","create_ticket","get_context"]},"ticket_id":{"type":"string"},"status":{"type":"string"},"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"integer"},"assignee_agent":{"type":"string"}},"required":["action"]}},
    {"type":"custom","name":"ceo_report","description":"Structured report to CEO. Types: progress/blocker/completion/decision_needed.","input_schema":{"type":"object","properties":{"report_type":{"type":"string","enum":["progress","blocker","completion","decision_needed"]},"summary":{"type":"string"},"details":{"type":"string"},"next_actions":{"type":"array","items":{"type":"string"}}},"required":["report_type","summary"]}}
  ],
  "skills":[{"type":"anthropic","skill_id":"xlsx"},{"type":"anthropic","skill_id":"docx"}],
  "callable_agents":[],
  "metadata":{"role":"coordinator"}
}
AGENT1
)
SPM_ID=$(id "$_SPM"); SPM_V=$(ver "$_SPM")
echo "    ID=$SPM_ID  V=$SPM_V"

# --- Agent 2: Architecture Specialist ---
echo "  [2/6] Architecture Specialist..."
_ARCH=$(C "$API/agents" -d @- <<AGENT2
{
  "name":"Architecture Specialist","model":"claude-sonnet-4-6",
  "system":"Architecture for RestoreAssist.\n\n${ANTI_RUSH}\n\nDOMAIN: System design, DB schemas (Supabase/Postgres), API contracts, component hierarchy, infra (Vercel/Edge/CDN), design tokens.\n\nTHOROUGHNESS:\n- Read ALL existing architecture docs before proposing changes\n- Every decision doc: problem statement, 3+ alternatives, rationale, migration path, rollback plan\n- Schema changes: up SQL + rollback SQL + data migration strategy\n- API contracts: full OpenAPI spec with examples, error codes, rate limits\n- THREAT MODEL every new endpoint\n- Never code — design only. Implementation goes to Impl Specialist.\n- Check memory for prior decisions",
  "tools":[{"type":"agent_toolset_20260401","configs":[{"name":"bash","enabled":false}]}],
  "metadata":{"role":"specialist","domain":"architecture"}
}
AGENT2
)
ARCH_ID=$(id "$_ARCH"); ARCH_V=$(ver "$_ARCH")
echo "    ID=$ARCH_ID  V=$ARCH_V"

# --- Agent 3: Implementation Specialist ---
echo "  [3/6] Implementation Specialist..."
_IMPL=$(C "$API/agents" -d @- <<AGENT3
{
  "name":"Implementation Specialist","model":"claude-sonnet-4-6",
  "system":"Implementation for RestoreAssist.\n\n${ANTI_RUSH}\n\nDOMAIN: TypeScript, Next.js App Router, Supabase Edge Functions, Stripe, API routes, Tailwind.\n\nCODE QUALITY GATES:\n- TS strict: no any, no unknown without narrowing, no type assertions unless justified\n- Every async: try/catch with typed error\n- Every API route: zod validation, auth check, rate limit, typed response\n- Every component: loading/error/empty state, mobile responsive, keyboard accessible\n- Functions <40 lines. Files <300 lines.\n- JSDoc on every export. Conventional Commits.\n\nSECURITY:\n- Parameterised queries only\n- Sanitise all user input (XSS)\n- CSRF tokens on mutations\n- Auth middleware on protected routes\n- Secrets in env vars only\n- Validate webhook signatures\n- Security headers: CSP, X-Frame, X-Content-Type",
  "tools":[{"type":"agent_toolset_20260401","default_config":{"permission_policy":{"type":"always_allow"}}}],
  "metadata":{"role":"specialist","domain":"implementation"}
}
AGENT3
)
IMPL_ID=$(id "$_IMPL"); IMPL_V=$(ver "$_IMPL")
echo "    ID=$IMPL_ID  V=$IMPL_V"

# --- Agent 4: Testing Specialist ---
echo "  [4/6] Testing Specialist..."
_TEST=$(C "$API/agents" -d @- <<AGENT4
{
  "name":"Testing Specialist","model":"claude-sonnet-4-6",
  "system":"Testing for RestoreAssist.\n\n${ANTI_RUSH}\n\nDOMAIN: Vitest unit, Playwright E2E, API integration, Lighthouse perf, WCAG AA, npm audit.\n\nTHOROUGHNESS:\n- Per function: happy path, null/undefined, empty arrays, boundary values, error paths\n- Per API route: valid request, missing auth, invalid body, rate limit, malformed params\n- Per component: renders, interactions, loading/error/empty state, keyboard nav\n- Security: SQL injection, XSS payloads, CSRF without token, auth bypass\n- Performance: Lighthouse 90+\n\nMISSING ELEMENT DETECTION:\n- Scan for: TODO/FIXME/HACK, empty catch blocks, console.log in prod, hardcoded secrets, unused imports, dead code\n- Report ALL with exact file:line references\n- Severity: CRITICAL/HIGH/MEDIUM/LOW\n- Never fix code — report to Impl with reproduction steps\n- Results to test-reports/ as JSON",
  "tools":[{"type":"agent_toolset_20260401","default_config":{"permission_policy":{"type":"always_allow"}}}],
  "metadata":{"role":"specialist","domain":"testing"}
}
AGENT4
)
TEST_ID=$(id "$_TEST"); TEST_V=$(ver "$_TEST")
echo "    ID=$TEST_ID  V=$TEST_V"

# --- Agent 5: Review & Docs Specialist ---
echo "  [5/6] Review & Docs Specialist..."
_REV=$(C "$API/agents" -d @- <<AGENT5
{
  "name":"Review Specialist","model":"claude-sonnet-4-6",
  "system":"Review & Docs for RestoreAssist.\n\n${ANTI_RUSH}\n\nDOMAIN: Code review, OpenAPI docs, READMEs, changelogs, content quality.\n\nCODE REVIEW (line-by-line):\n- Read every changed file completely\n- Check: error handling, types, security, performance, readability, test coverage\n- Flag: over-engineering, unnecessary abstractions, premature optimisation, duplication\n- Flag: missing validation, auth checks, error states, accessibility\n- Flag: bloat\n- Format: file:line | severity | issue | suggested fix\n\nCONTENT REVIEW:\n- No We/Our/I/Us/My\n- No delve/tapestry/landscape/leverage/robust/seamless/elevate\n- Every section answers a search intent\n- Internal + external links\n- Valid structured data\n- Match CURRENT codebase only — never document aspirational features",
  "tools":[{"type":"agent_toolset_20260401","configs":[{"name":"bash","enabled":false}]}],
  "skills":[{"type":"anthropic","skill_id":"docx"},{"type":"anthropic","skill_id":"pdf"}],
  "metadata":{"role":"specialist","domain":"review"}
}
AGENT5
)
REV_ID=$(id "$_REV"); REV_V=$(ver "$_REV")
echo "    ID=$REV_ID  V=$REV_V"

# --- Agent 6: Content & SEO Specialist ---
echo "  [6/6] Content & SEO Specialist..."
_SEO=$(C "$API/agents" -d @- <<AGENT6
{
  "name":"Content Specialist","model":"claude-sonnet-4-6",
  "system":"Content & SEO/AEO/GEO for RestoreAssist.\n\n${ANTI_RUSH}\n\nDOMAIN: Keyword research, page architecture, SEO copy, JSON-LD, meta+OG, sitemaps, competitor analysis, AEO/GEO.\n\nRESEARCH BEFORE WRITING:\n- web_search for current SERP landscape BEFORE writing\n- web_fetch competitor pages\n- Check memory for existing keyword data\n\nGOLDEN RULES:\n1. No We/Our/I/Us/My\n2. No delve/tapestry/landscape/leverage/utilize/robust/seamless/elevate/game-changer\n3. Every paragraph answers a search intent\n4. Parameterised by client/market/keywords\n5. External citations + internal links always\n\nAI tone scan on ALL output — twice. Content to content/ dir.",
  "tools":[{"type":"agent_toolset_20260401","default_config":{"permission_policy":{"type":"always_allow"}}}],
  "metadata":{"role":"specialist","domain":"content-seo"}
}
AGENT6
)
SEO_ID=$(id "$_SEO"); SEO_V=$(ver "$_SEO")
echo "    ID=$SEO_ID  V=$SEO_V"

# --- Wire callable_agents on Senior PM ---
echo "=== Wiring callable agents ==="
C -X PUT "$API/agents/$SPM_ID" -d '{
  "version":'"$SPM_V"',
  "callable_agents":[
    {"type":"agent","id":"'"$ARCH_ID"'","version":'"$ARCH_V"'},
    {"type":"agent","id":"'"$IMPL_ID"'","version":'"$IMPL_V"'},
    {"type":"agent","id":"'"$TEST_ID"'","version":'"$TEST_V"'},
    {"type":"agent","id":"'"$REV_ID"'","version":'"$REV_V"'},
    {"type":"agent","id":"'"$SEO_ID"'","version":'"$SEO_V"'}
  ]
}' > /dev/null
echo "  Done."

# --- Environment ---
echo "=== Creating environment ==="
ENV_ID=$(C "$API/environments" -d '{
  "name":"restoreassist-prod",
  "config":{
    "type":"cloud",
    "networking":{"type":"unrestricted"},
    "setup_commands":[
      "npm i -g typescript tsx eslint prettier",
      "pip install --break-system-packages requests python-dotenv"
    ]
  }
}' | jq -r '.id')
echo "  ENV_ID=$ENV_ID"

# --- Memory Stores ---
echo "=== Creating memory stores ==="
PROJ_MEM=$(C "$API/memory_stores" -d '{
  "name":"restoreassist-context",
  "description":"Architecture, conventions, golden rules, security standards. All read. SPM+Review write."
}' | jq -r '.id')
echo "  PROJ_MEM=$PROJ_MEM"

# Seed project memory
for m in \
  '{"path":"/arch/stack","content":"Next.js 15 App Router on Vercel · Supabase (Postgres+Edge+Auth+Storage) · Stripe · Claude Sonnet 4.6 primary · Linear PM · Git · Prisma ORM · 120+ models · Capacitor mobile"}' \
  '{"path":"/rules/golden","content":"1.No first-person biz lang 2.No AI-tone words 3.Every paragraph answers search intent 4.Parameterised by client/market/keywords 5.External citations + internal links always"}' \
  '{"path":"/rules/code","content":"TS strict · ESLint+Prettier · Conventional Commits · feature|fix/{ticket}-{desc} · Vitest+Playwright · Server Components default · No any · try/catch async · JSDoc exports · Functions<40 lines · Files<300 lines · shadcn/ui components only"}' \
  '{"path":"/rules/security","content":"Parameterised queries only · Sanitise all input (XSS) · CSRF tokens on mutations · Auth middleware (getServerSession) · Secrets in env vars only · Validate webhook signatures · Security headers · npm audit clean · No console.log in prod · session.user.id not email · magic bytes for uploads"}'; do
  echo "$m" | C "$API/memory_stores/$PROJ_MEM/memories" -d @- > /dev/null
done
echo "  Seeded 4 memories."

SPRINT_MEM=$(C "$API/memory_stores" -d '{
  "name":"restoreassist-sprints",
  "description":"Per-sprint learnings, resolved bugs, perf benchmarks, security findings. SPM writes per session."
}' | jq -r '.id')
echo "  SPRINT_MEM=$SPRINT_MEM"

# --- Rubric ---
echo "=== Uploading rubric ==="
RUBRIC_ID=$(curl -fsSL "$API/files" "${H[@]}" \
  -H "anthropic-beta:managed-agents-2026-04-01,files-api-2025-04-14" \
  -F file=@- <<'RUBRIC' | jq -r '.id'
# RestoreAssist Delivery Rubric v2

## Architecture (if applicable)
- Design doc with problem statement, 3+ alternatives, rationale, migration path
- Schema migrations: up + rollback + data migration strategy
- API contracts: full request/response schemas, error codes, rate limits

## Code Quality
- TypeScript strict — zero any, zero untyped exports
- Every async: try/catch with typed error
- Every API route: input validation, auth check, rate limit, typed response
- Every component: loading + error + empty states, mobile responsive, keyboard accessible
- Functions <40 lines, files <300 lines, zero dead code
- ESLint + Prettier clean. Conventional Commits.
- Zero TODO/FIXME/HACK. Zero console.log in prod. Zero hardcoded secrets.

## Security
- Parameterised queries — zero string-concatenated SQL
- Input sanitisation (XSS). CSRF protection. Auth middleware.
- Webhook signature validation. Security headers. npm audit clean.

## Testing
- Unit: happy + error + edge + boundary per function
- Integration: every API route + DB operation
- Security: injection, auth bypass, CSRF tests
- All CRITICAL/HIGH resolved. Existing tests pass.

## Content (if applicable)
- Zero first-person language. Zero AI-tone words (scanned twice).
- Every section answers search intent. Valid JSON-LD. Links verified.

## Completeness
- Code review done, HIGH+ feedback addressed
- Linear ticket updated to Done with notes
- Learnings written to memory
RUBRIC
)
echo "  RUBRIC_ID=$RUBRIC_ID"

# --- Create Session ---
echo "=== Creating session ==="
SESSION_ID=$(CRP "$API/sessions" -d '{
  "agent":"'"$SPM_ID"'",
  "environment_id":"'"$ENV_ID"'",
  "title":"Sprint '"$(date +%Y-%m-%d)"'",
  "resources":[
    {"type":"memory_store","memory_store_id":"'"$PROJ_MEM"'","access":"read_write","prompt":"Project conventions, architecture, security standards. CHECK BEFORE ANY WORK."},
    {"type":"memory_store","memory_store_id":"'"$SPRINT_MEM"'","access":"read_write","prompt":"Sprint history. Write detailed summary when done."}
  ]
}' | jq -r '.id')
echo "  SESSION_ID=$SESSION_ID"

# --- Fire first outcome ---
echo "=== Firing first outcome ==="
CRP "$API/sessions/$SESSION_ID/events" -d '{
  "events":[{
    "type":"user.define_outcome",
    "description":"1. Pull highest-priority Linear ticket (get_context for full details). 2. Read relevant codebase areas BEFORE planning. 3. Decompose with explicit acceptance criteria per subtask. 4. Delegate to specialists. 5. Verify each return against criteria. 6. Run Testing Specialist. 7. Run Review Specialist. 8. Only mark done when rubric satisfied. 9. Update Linear. 10. Write learnings to memory.",
    "rubric":{"type":"file","file_id":"'"$RUBRIC_ID"'"},
    "max_iterations":5
  }]
}' > /dev/null
echo "  First outcome fired."

# --- Save IDs ---
cat >> "$OUTFILE" <<IDS
SPM_ID=$SPM_ID
ARCH_ID=$ARCH_ID
IMPL_ID=$IMPL_ID
TEST_ID=$TEST_ID
REV_ID=$REV_ID
SEO_ID=$SEO_ID
ENV_ID=$ENV_ID
PROJ_MEM=$PROJ_MEM
SPRINT_MEM=$SPRINT_MEM
RUBRIC_ID=$RUBRIC_ID
SESSION_ID=$SESSION_ID
IDS

echo ""
echo "=== SETUP COMPLETE ==="
echo "All IDs saved to: $OUTFILE"
echo ""
echo "To stream the session:"
echo "  curl -sS -N -H 'x-api-key:\$ANTHROPIC_API_KEY' \\"
echo "    -H 'anthropic-beta:managed-agents-2026-04-01-research-preview' \\"
echo "    -H 'Accept:text/event-stream' \\"
echo "    '$API/sessions/$SESSION_ID/stream?beta=true'"
echo ""
echo "To steer mid-execution:"
echo "  curl -X POST '$API/sessions/$SESSION_ID/events' \\"
echo "    -H 'x-api-key:\$ANTHROPIC_API_KEY' \\"
echo "    -H 'anthropic-beta:managed-agents-2026-04-01-research-preview' \\"
echo "    -H 'content-type:application/json' \\"
echo "    -d '{\"events\":[{\"type\":\"user.message\",\"content\":[{\"type\":\"text\",\"text\":\"CEO DIRECTIVE: ...\"}]}]}'"
