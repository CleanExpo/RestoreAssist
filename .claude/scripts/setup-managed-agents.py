#!/usr/bin/env python3
"""
Managed Agents v4 Setup — RestoreAssist / SYNTHEX
Creates 6 specialist agents, memory stores, environment, rubric, and session.
Usage: python3 setup-managed-agents.py
Requires: ANTHROPIC_API_KEY env var
"""
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
if not API_KEY:
    print("ERROR: ANTHROPIC_API_KEY is not set.")
    sys.exit(1)

API = "https://api.anthropic.com/v1"
HEADERS = {
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "managed-agents-2026-04-01",
    "content-type": "application/json",
}
HEADERS_RP = {**HEADERS, "anthropic-beta": "managed-agents-2026-04-01-research-preview"}

# SSL context for Windows (disables certificate revocation checks)
import ssl
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def api(method: str, path: str, body=None, research_preview=False) -> dict:
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body else None
    headers = HEADERS_RP if research_preview else HEADERS
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=ssl_ctx) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body[:300]}")
        raise


def post(path, body, rp=False):
    return api("POST", path, body, rp)


def put(path, body, rp=False):
    return api("PUT", path, body, rp)


def get(path, rp=False):
    return api("GET", path, research_preview=rp)


# --- Anti-rush protocol (embedded in all system prompts) ---
ANTI_RUSH = """
## EXECUTION DISCIPLINE (NON-NEGOTIABLE)

PACE: You are paid for thoroughness, not speed. Every task gets the time it needs.
- Before writing ANY code: read the existing codebase in the target area FIRST
- Before proposing ANY architecture: read existing docs/architecture/ FIRST
- Before ANY content: check memory for prior patterns FIRST
- NEVER generate placeholder/TODO code. Every function is complete or not written.
- NEVER skip error handling, loading states, edge cases, or types.
- NEVER use any type. NEVER leave untyped exports.
- If unsure about requirements, ASK via ceo_report tool — do not assume.

COMPLETENESS CHECKLIST (run before marking ANY task done):
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

QUALITY OVER QUANTITY:
- Fewer files with complete, tested code > many files with gaps.
- One fully working feature > three half-working features.
- Ask: Would I ship this to a paying customer right now? If no, keep working.
"""


def create_agent(name, system, tools, skills=None, metadata=None):
    body = {
        "name": name,
        "model": "claude-sonnet-4-6",
        "system": system,
        "tools": tools,
        "callable_agents": [],
    }
    if skills:
        body["skills"] = skills
    if metadata:
        body["metadata"] = metadata
    result = post("/agents", body)
    return result["id"], result["version"]


print("=== RestoreAssist Managed Agents v4 Setup ===\n")

# --------------------------------------------------------------------------
# 1. CREATE AGENTS
# --------------------------------------------------------------------------
print("--- Creating Agents ---")

# Agent 1: Senior PM (Coordinator)
print("  [1/6] Senior Project Manager...")
spm_system = f"""Senior PM for RestoreAssist. You coordinate specialist agents.
{ANTI_RUSH}

## PROTOCOL
1. Check memory stores FIRST — every session
2. Pull next priority from Linear (linear_sync)
3. Read the FULL ticket context including comments and attachments
4. Decompose into specialist subtasks with EXPLICIT acceptance criteria
5. Delegate via callable_agents — NEVER do specialist work yourself
6. When specialist returns: VERIFY against acceptance criteria. Reject if incomplete.
7. After ALL subtasks pass: synthesise into deliverable
8. Run Review Specialist on everything before marking done
9. Update Linear with detailed completion notes
10. Write learnings to memory
11. Report to CEO (ceo_report)

LINEAR PACING: One ticket at a time. Do not pull next until current is DONE.

HARD RULES:
- Source decisions from architecture, not training
- Every response references a file/ticket/doc
- Zero filler: no delve/tapestry/landscape/leverage/robust/seamless
- NEVER mark a ticket Done until Testing Specialist confirms all tests pass"""

spm_tools = [
    {
        "type": "agent_toolset_20260401",
        "default_config": {"permission_policy": {"type": "always_allow"}},
        "configs": [{"name": "bash", "permission_policy": {"type": "always_ask"}}],
    },
    {
        "type": "custom",
        "name": "linear_sync",
        "description": "Linear PM. Actions: pull_next, update_status, create_ticket, get_context.",
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["pull_next", "update_status", "create_ticket", "get_context"]},
                "ticket_id": {"type": "string"},
                "status": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "priority": {"type": "integer"},
                "assignee_agent": {"type": "string"},
            },
            "required": ["action"],
        },
    },
    {
        "type": "custom",
        "name": "ceo_report",
        "description": "Structured report to CEO. Types: progress/blocker/completion/decision_needed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "report_type": {"type": "string", "enum": ["progress", "blocker", "completion", "decision_needed"]},
                "summary": {"type": "string"},
                "details": {"type": "string"},
                "next_actions": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["report_type", "summary"],
        },
    },
]
spm_id, spm_v = create_agent(
    "Senior Project Manager",
    spm_system,
    spm_tools,
    skills=[{"type": "anthropic", "skill_id": "xlsx"}, {"type": "anthropic", "skill_id": "docx"}],
    metadata={"role": "coordinator"},
)
print(f"    ID={spm_id}  V={spm_v}")

# Agent 2: Architecture Specialist
print("  [2/6] Architecture Specialist...")
arch_system = f"""Architecture for RestoreAssist.
{ANTI_RUSH}

DOMAIN: System design, DB schemas (Supabase/Postgres), API contracts, component hierarchy, infra (Vercel/Edge/CDN).

THOROUGHNESS:
- Read ALL existing architecture docs before proposing changes
- Every decision doc: problem statement, 3+ alternatives, rationale, migration path, rollback plan
- Schema changes: up SQL + rollback SQL + data migration strategy
- API contracts: full OpenAPI spec with examples, error codes, rate limits
- THREAT MODEL every new endpoint
- Never code — design only. Implementation goes to Implementation Specialist.
- Check memory for prior decisions to avoid contradicting established patterns"""

arch_id, arch_v = create_agent(
    "Architecture Specialist",
    arch_system,
    [{"type": "agent_toolset_20260401", "configs": [{"name": "bash", "enabled": False}]}],
    metadata={"role": "specialist", "domain": "architecture"},
)
print(f"    ID={arch_id}  V={arch_v}")

# Agent 3: Implementation Specialist
print("  [3/6] Implementation Specialist...")
impl_system = f"""Implementation for RestoreAssist.
{ANTI_RUSH}

DOMAIN: TypeScript, Next.js App Router, Supabase Edge Functions, Stripe, API routes, Tailwind, Prisma.

CODE QUALITY GATES (every file, no exceptions):
- TS strict: no any, no unknown without narrowing, no type assertions unless justified in comment
- Every async: try/catch with typed error, never swallow errors silently
- Every API route: zod input validation, auth check (getServerSession), rate limit, typed response
- Every component: loading state, error state, empty state, mobile responsive, keyboard accessible
- Every hook: cleanup/unsubscribe in useEffect return
- Functions <40 lines. Files <300 lines. Extract when exceeding.
- JSDoc on every export. Conventional Commits. feature|fix/{{ticket}}-{{desc}} branches.

SECURITY (non-negotiable):
- Parameterised queries only — never string-concatenate SQL
- Sanitise all user input before render (XSS)
- CSRF tokens on state-changing requests
- Auth middleware on every protected route
- Secrets in env vars only — never in code, never in logs
- Validate webhook signatures (Stripe, etc.)
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options"""

impl_id, impl_v = create_agent(
    "Implementation Specialist",
    impl_system,
    [{"type": "agent_toolset_20260401", "default_config": {"permission_policy": {"type": "always_allow"}}}],
    metadata={"role": "specialist", "domain": "implementation"},
)
print(f"    ID={impl_id}  V={impl_v}")

# Agent 4: Testing Specialist
print("  [4/6] Testing Specialist...")
test_system = f"""Testing for RestoreAssist.
{ANTI_RUSH}

DOMAIN: Vitest unit, Playwright E2E, API integration, Lighthouse perf, WCAG AA, npm audit.

THOROUGHNESS:
- Per function: happy path, null/undefined, empty arrays, boundary values, error paths
- Per API route: valid request, missing auth, invalid body, rate limit, malformed params
- Per component: renders, interactions, loading/error/empty state, keyboard nav
- Security: SQL injection attempts, XSS payloads, CSRF without token, auth bypass
- Performance: Lighthouse 90+ all metrics

MISSING ELEMENT DETECTION:
- Scan for: TODO/FIXME/HACK, empty catch blocks, console.log in prod, hardcoded secrets, unused imports, dead code, missing error boundaries, unprotected routes, missing webhook signature verification
- Report ALL findings with exact file:line references
- Severity: CRITICAL/HIGH/MEDIUM/LOW
- Never fix code — report to Implementation with file:line and reproduction steps
- Results to test-reports/ as structured JSON"""

test_id, test_v = create_agent(
    "Testing Specialist",
    test_system,
    [{"type": "agent_toolset_20260401", "default_config": {"permission_policy": {"type": "always_allow"}}}],
    metadata={"role": "specialist", "domain": "testing"},
)
print(f"    ID={test_id}  V={test_v}")

# Agent 5: Review & Docs Specialist
print("  [5/6] Review & Docs Specialist...")
rev_system = f"""Review & Docs for RestoreAssist.
{ANTI_RUSH}

DOMAIN: Code review, OpenAPI docs, READMEs, changelogs, content quality.

CODE REVIEW PROTOCOL (line-by-line, not skim):
- Read every changed file completely. No skimming.
- Check: error handling, types, security, performance, readability, test coverage
- Flag: over-engineering, unnecessary abstractions, premature optimisation, duplication
- Flag: missing validation, auth checks, error states, accessibility
- Flag: bloat — code that could be removed without losing functionality
- Format: file:line | severity | issue | suggested fix

CONTENT REVIEW:
- No We/Our/I/Us/My
- No delve/tapestry/landscape/leverage/robust/seamless/elevate
- Every section answers a search intent
- Internal + external links
- Valid structured data
- Match CURRENT codebase only — never document aspirational features"""

rev_id, rev_v = create_agent(
    "Review Specialist",
    rev_system,
    [{"type": "agent_toolset_20260401", "configs": [{"name": "bash", "enabled": False}]}],
    skills=[{"type": "anthropic", "skill_id": "docx"}, {"type": "anthropic", "skill_id": "pdf"}],
    metadata={"role": "specialist", "domain": "review"},
)
print(f"    ID={rev_id}  V={rev_v}")

# Agent 6: Content & SEO Specialist
print("  [6/6] Content & SEO Specialist...")
seo_system = f"""Content & SEO/AEO/GEO for RestoreAssist.
{ANTI_RUSH}

DOMAIN: Keyword research, page architecture, SEO copy, JSON-LD, meta+OG, sitemaps, competitor analysis, AEO/GEO.

RESEARCH BEFORE WRITING (non-negotiable):
- web_search for current SERP landscape BEFORE writing
- web_fetch competitor pages to analyse structure, depth, schema, linking
- Check memory for existing keyword data

GOLDEN RULES:
1. No We/Our/I/Us/My
2. No delve/tapestry/landscape/leverage/utilize/robust/seamless/elevate/game-changer
3. Every paragraph answers a search intent
4. Parameterised by client/market/keywords
5. External citations + internal links always

AI tone scan on ALL output — twice. Content to content/ dir."""

seo_id, seo_v = create_agent(
    "Content Specialist",
    seo_system,
    [{"type": "agent_toolset_20260401", "default_config": {"permission_policy": {"type": "always_allow"}}}],
    metadata={"role": "specialist", "domain": "content-seo"},
)
print(f"    ID={seo_id}  V={seo_v}")

# --------------------------------------------------------------------------
# 2. WIRE CALLABLE AGENTS ON SENIOR PM
# --------------------------------------------------------------------------
print("\n--- Wiring callable agents ---")
put(f"/agents/{spm_id}", {
    "version": spm_v,
    "callable_agents": [
        {"type": "agent", "id": arch_id, "version": arch_v},
        {"type": "agent", "id": impl_id, "version": impl_v},
        {"type": "agent", "id": test_id, "version": test_v},
        {"type": "agent", "id": rev_id, "version": rev_v},
        {"type": "agent", "id": seo_id, "version": seo_v},
    ],
})
print("  Done.")

# --------------------------------------------------------------------------
# 3. CREATE ENVIRONMENT
# --------------------------------------------------------------------------
print("\n--- Creating environment ---")
env = post("/environments", {
    "name": "restoreassist-prod",
    "config": {
        "type": "cloud",
        "networking": {"type": "unrestricted"},
        "setup_commands": [
            "npm i -g typescript tsx eslint prettier",
            "pip install --break-system-packages requests python-dotenv",
        ],
    },
})
env_id = env["id"]
print(f"  ENV_ID={env_id}")

# --------------------------------------------------------------------------
# 4. CREATE MEMORY STORES
# --------------------------------------------------------------------------
print("\n--- Creating memory stores ---")
proj_mem = post("/memory_stores", {
    "name": "restoreassist-context",
    "description": "Architecture, conventions, golden rules, security standards. All read. SPM+Review write.",
})["id"]
print(f"  PROJ_MEM={proj_mem}")

memories = [
    ("/arch/stack", "Next.js 15 App Router on Vercel · Supabase (Postgres+Edge+Auth+Storage) · Stripe · Claude Sonnet 4.6 · Linear PM · Git · Prisma ORM · 120+ models · Capacitor mobile (server-hosted WebView)"),
    ("/rules/golden", "1.No first-person biz lang 2.No AI-tone words 3.Every paragraph answers search intent 4.Parameterised by client/market/keywords 5.External citations + internal links always"),
    ("/rules/code", "TS strict · ESLint+Prettier · Conventional Commits · feature|fix/{ticket}-{desc} · Vitest+Playwright · Server Components default · No any · try/catch async · JSDoc exports · Functions<40 lines · Files<300 lines · shadcn/ui only · getServerSession for auth · session.user.id (not email)"),
    ("/rules/security", "Parameterised queries only · Sanitise all input (XSS) · CSRF tokens on mutations · Auth middleware (getServerSession) · Secrets in env vars only · Validate webhook signatures · Security headers (CSP/X-Frame/X-Content-Type) · npm audit clean · No console.log in prod · session.user.id not email · magic bytes for file upload validation"),
]
for path, content in memories:
    post(f"/memory_stores/{proj_mem}/memories", {"path": path, "content": content})
print(f"  Seeded {len(memories)} memories.")

sprint_mem = post("/memory_stores", {
    "name": "restoreassist-sprints",
    "description": "Per-sprint learnings, resolved bugs, perf benchmarks, security findings. SPM writes per session.",
})["id"]
print(f"  SPRINT_MEM={sprint_mem}")

# --------------------------------------------------------------------------
# 5. UPLOAD RUBRIC
# --------------------------------------------------------------------------
print("\n--- Uploading rubric ---")
RUBRIC_CONTENT = """# RestoreAssist Delivery Rubric v2

## Architecture (if applicable)
- Design doc with problem statement, 3+ alternatives, rationale, migration path
- Schema migrations include up + rollback + data migration strategy
- API contracts: full request/response schemas, error codes, rate limits documented

## Code Quality
- TypeScript strict — zero any, zero untyped exports, zero type assertions without comment
- Every async: try/catch with typed error — no silent swallows, no empty catch blocks
- Every API route: input validation (zod), auth check, rate limit, typed response
- Every component: loading + error + empty states, mobile responsive, keyboard accessible
- Functions <40 lines, files <300 lines, zero dead code, zero unused imports
- ESLint + Prettier clean. Conventional Commits. Correct branch naming.
- Zero TODO/FIXME/HACK in delivered code
- Zero console.log in production code
- Zero hardcoded secrets or magic strings

## Security
- Parameterised queries — zero string-concatenated SQL
- Input sanitisation on all user-facing endpoints (XSS prevention)
- CSRF protection on state-changing requests
- Auth middleware on every protected route
- Webhook signature validation on all external integrations
- Security headers set: CSP, X-Frame-Options, X-Content-Type-Options
- npm audit: zero critical/high vulnerabilities

## Testing
- Unit: happy + error + edge + boundary cases per function
- Integration: every API route + DB operation
- Security: injection attempts, auth bypass, CSRF without token
- All CRITICAL/HIGH failures resolved before delivery
- Existing tests still pass
- Results in test-reports/ as structured JSON

## Content (if applicable)
- Zero first-person business language
- Zero AI-tone words (scan run twice, both clean)
- Every section answers a specific search intent
- Valid JSON-LD structured data
- Internal + external links present and verified live

## Completeness
- Code review completed by Review Specialist, all HIGH+ feedback addressed
- README updated if public API changed
- Linear ticket updated to Done with completion notes
- Learnings written to memory store
- No missing error boundaries, unprotected routes, or unvalidated endpoints
""".encode()

import urllib.request
import urllib.parse

boundary = "----FormBoundary7MA4YWxkTrZu0gW"
rubric_body = (
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="file"; filename="rubric.md"\r\n'
    f"Content-Type: text/markdown\r\n\r\n"
).encode() + RUBRIC_CONTENT + f"\r\n--{boundary}--\r\n".encode()

rubric_headers = {
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "managed-agents-2026-04-01,files-api-2025-04-14",
    "content-type": f"multipart/form-data; boundary={boundary}",
}
rubric_req = urllib.request.Request(
    f"{API}/files",
    data=rubric_body,
    headers=rubric_headers,
    method="POST",
)
with urllib.request.urlopen(rubric_req, context=ssl_ctx) as resp:
    rubric_data = json.loads(resp.read())
rubric_id = rubric_data["id"]
print(f"  RUBRIC_ID={rubric_id}")

# --------------------------------------------------------------------------
# 6. CREATE SESSION + FIRE FIRST OUTCOME
# --------------------------------------------------------------------------
print("\n--- Creating session ---")
session = post("/sessions", {
    "agent": spm_id,
    "environment_id": env_id,
    "title": f"Sprint {datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
    "resources": [
        {
            "type": "memory_store",
            "memory_store_id": proj_mem,
            "access": "read_write",
            "prompt": "Project conventions, architecture, security standards. CHECK BEFORE ANY WORK.",
        },
        {
            "type": "memory_store",
            "memory_store_id": sprint_mem,
            "access": "read_write",
            "prompt": "Sprint history. Write detailed summary including learnings when done.",
        },
    ],
}, rp=True)
session_id = session["id"]
print(f"  SESSION_ID={session_id}")

print("\n--- Firing first outcome ---")
post(f"/sessions/{session_id}/events", {
    "events": [{
        "type": "user.define_outcome",
        "description": (
            "1. Pull highest-priority Linear ticket (get_context for full details). "
            "2. Read relevant codebase areas BEFORE planning. "
            "3. Decompose with explicit acceptance criteria per subtask. "
            "4. Delegate to specialists. "
            "5. Verify each return against criteria — reject incomplete work. "
            "6. Run Testing Specialist on everything. "
            "7. Run Review Specialist on everything. "
            "8. Only mark done when rubric is fully satisfied. "
            "9. Update Linear with detailed notes. "
            "10. Write learnings to memory."
        ),
        "rubric": {"type": "file", "file_id": rubric_id},
        "max_iterations": 5,
    }]
}, rp=True)
print("  First outcome fired.")

# --------------------------------------------------------------------------
# 7. SAVE IDS
# --------------------------------------------------------------------------
script_dir = os.path.dirname(os.path.abspath(__file__))
env_file = os.path.join(script_dir, "..", ".env.agents")

ids = {
    "SPM_ID": spm_id,
    "ARCH_ID": arch_id,
    "IMPL_ID": impl_id,
    "TEST_ID": test_id,
    "REV_ID": rev_id,
    "SEO_ID": seo_id,
    "ENV_ID": env_id,
    "PROJ_MEM": proj_mem,
    "SPRINT_MEM": sprint_mem,
    "RUBRIC_ID": rubric_id,
    "SESSION_ID": session_id,
}

with open(env_file, "w") as f:
    f.write(f"# Managed Agents IDs — generated {datetime.now(timezone.utc).isoformat()}\n")
    for k, v in ids.items():
        f.write(f"{k}={v}\n")

print(f"\n=== SETUP COMPLETE ===")
print(f"All IDs saved to: {env_file}")
print(f"\nSession stream URL:")
print(f"  https://api.anthropic.com/v1/sessions/{session_id}/stream?beta=true")
print(f"\nTo steer mid-execution:")
print(f"  POST https://api.anthropic.com/v1/sessions/{session_id}/events")
print(f"  Body: {{\"events\":[{{\"type\":\"user.message\",\"content\":[{{\"type\":\"text\",\"text\":\"CEO DIRECTIVE: ...\"}}]}}]}}")
print(f"\nAgent IDs:")
for k, v in ids.items():
    print(f"  {k}: {v}")
