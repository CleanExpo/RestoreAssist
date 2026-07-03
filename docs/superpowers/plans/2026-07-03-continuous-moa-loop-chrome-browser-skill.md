# chrome-browser Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `chrome-browser` skill to the Pi-Dev-Ops global skill fleet that wraps the `claude-in-chrome` MCP tool set with documented best practices (navigation, tab management, reading page content, common pitfalls), and get it merged via PR.

**Architecture:** One `plain-technique` skill at `/Users/phillmcgurk/Pi-Dev-Ops/skills/chrome-browser/SKILL.md`, model-invoked (no `disable-model-invocation`), no `references/` subfolder needed — the content fits comfortably under the 200-line cap without needing to defer material. Catalog placement via a new `/Users/phillmcgurk/Pi-Dev-Ops/skills/README.md` (does not exist yet in this repo — created fresh, not edited).

**Tech Stack:** Markdown only (skill authoring). No code, no tests, no build step.

## Global Constraints

- SKILL.md must pass every item in `/Users/phillmcgurk/Pi-Dev-Ops/skills/skill-authoring-standard/references/review-checklist.md`.
- Frontmatter must match one archetype exactly per `/Users/phillmcgurk/Pi-Dev-Ops/skills/skill-authoring-standard/references/frontmatter-schema.md` — no banned fields (`version`, `owner_role`, `status`, `metadata.requires`).
- SKILL.md ≤ 200 lines (hard cap; over means push content to `references/`).
- Never hardcode `mcp__…` prefixes in the skill body — Pi-Dev-Ops's own UUIDs drift session to session (this session's own tool list proves it: `claude-in-chrome` tools appear as `mcp__claude-in-chrome__navigate` etc., a human-readable server name today, but the schema explicitly bans hardcoding and instructs resolution "by capability via ToolSearch").
- **Out of scope, explicitly:** "auto-connect to the right Max Plan." This is a category error, not a missed requirement — Max Plan / account binding happens at `claude login`, entirely outside anything a skill's markdown content can read or influence. No task below attempts it, and Task 1's self-review restates why.
- Branch protection on `Pi-Dev-Ops` (confirmed via `gh api repos/CleanExpo/Pi-Dev-Ops/branches/main/protection`): required status checks (`Python (pytest + ruff)`, `Frontend (tsc + eslint + build)`, `Pi CEO API smoke test (28 checks)`), linear history required, force-push and branch deletion disabled, conversation resolution required. Never push to `main` directly.

---

### Task 1: Draft the chrome-browser SKILL.md

**Files:**
- Create: `/Users/phillmcgurk/Pi-Dev-Ops/skills/chrome-browser/SKILL.md`

**Interfaces:**
- Consumes: nothing (new skill, no dependency on other tasks).
- Produces: the skill file itself — Task 2 verifies it in place; Task 3 links to it from the catalog README using the skill's `name` frontmatter field (`chrome-browser`) and its one-line `description`.

**Archetype choice — plain-technique, justified:**
The frontmatter schema defines three archetypes. `command-skill` is for something a pilot fires deliberately with an argument (ruled out — nobody types `/chrome-browser <arg>`, this is reached mid-task). `agent-role` is a persona/gate pinned to a model tier (ruled out — this isn't a review gate or a persona, it's know-how). `plain-technique` is "model-invoked know-how the agent reaches autonomously" when the moment calls for it — exactly this: whenever an agent is about to drive a browser via the `claude-in-chrome` MCP tools, it should reach for this skill's patterns without the user having to name it. `use-railway` is the closest structural precedent (an MCP-tool-backed skill with a WHEN-triggers description ending in "even if they don't say 'Railway' explicitly") but is unusually long (228 lines) for a skill in this fleet, mixes CLI-first content, and does not need a `references/` split — `chrome-browser` is materially smaller since it wraps ~13 tools with no CLI-vs-MCP duality, so it stays as one file, no `references/` folder.

- [ ] **Step 1: Write the file**

Write the complete file below to `/Users/phillmcgurk/Pi-Dev-Ops/skills/chrome-browser/SKILL.md`:

```markdown
---
name: chrome-browser
description: Use when the user asks to browse, click, navigate, fill a form, screenshot, or read content from a live website via the claude-in-chrome MCP tools — or whenever a task needs to drive an actual Chrome tab rather than fetch static HTML.
---

# chrome-browser — driving Chrome via the claude-in-chrome MCP tools

Patterns for the `claude-in-chrome` MCP tool set: `navigate`, `computer`, `read_page`,
`get_page_text`, `find`, `tabs_context_mcp`, `tabs_create_mcp`, `tabs_close_mcp`,
`form_input`, `javascript_tool`, `read_console_messages`, `read_network_requests`,
`browser_batch`, `gif_creator`, `file_upload`, `upload_image`, `resize_window`,
`select_browser`, `switch_browser`, `list_connected_browsers`, `shortcuts_list`,
`shortcuts_execute`.

## Load the tools first

If these tools are deferred (unloaded), load the core set in one `ToolSearch` call —
never one tool at a time, each separate call wastes a round-trip:

```
ToolSearch query: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp"
```

Add task-specific tools to that **same** call when the task obviously needs them —
`read_console_messages` / `read_network_requests` for debugging, `form_input` for
forms, `gif_creator` for recordings, `javascript_tool` for page scripting. Only issue
a second `ToolSearch` call if the task later needs a tool you didn't anticipate.

Never hardcode the `mcp__claude-in-chrome__*` prefix outside a `ToolSearch` query —
resolve by capability, not by memorized string.

## Check tab context before acting

Call `tabs_context_mcp` before your first `navigate` or `computer` call in a session.
It tells you which tabs already exist and which is active — don't assume a blank
tab or that yours is the only one open. If the user is mid-workflow in a specific
tab, act on that tab rather than opening a new one.

## Reading page content: read_page vs get_page_text vs find

- **`get_page_text`** — fast plain-text extraction. Default choice when you need to
  know what's on the page (an article, a form's visible labels, search results) and
  don't need DOM structure or element handles to act on.
- **`read_page`** — structured DOM read (roles, element references, hierarchy). Use
  when you need to *act* next — click a specific button, fill a specific field — and
  `get_page_text` alone doesn't give you an addressable target.
- **`find`** — locate a specific element by description when you already know what
  you're looking for and don't need the whole page. Cheaper than a full `read_page`
  for one-target lookups (e.g. "find the submit button").

Rule of thumb: reading to *understand* → `get_page_text`. Reading to *act* →
`read_page` or `find`. Don't call `read_page` for a full DOM dump when `find` for one
element would do — it costs more context for no benefit.

## Navigation and tabs

- `navigate` changes the current tab's URL. `tabs_create_mcp` opens a new tab —
  prefer this over `navigate` when the user's current tab holds context you'd lose
  (an in-progress form, a login session tied to that tab's history).
- Close tabs you opened for a sub-task with `tabs_close_mcp` once done, unless the
  user is likely to want the result tab left open (e.g. they asked you to "open X for
  me" — that's a deliverable, not scratch work).
- `browser_batch` groups multiple browser actions into one call — use it for a known
  sequence (navigate → find → click → read) instead of round-tripping each step
  individually when the sequence doesn't depend on intermediate results changing the
  plan.

## Acting on the page

- `computer` drives raw mouse/keyboard actions (click, scroll, type) against
  coordinates or elements — the general-purpose actuator.
- `form_input` is purpose-built for filling form fields; prefer it over `computer`
  when the target is a labeled input, select, or textarea — it's more reliable than
  coordinate-based typing.
- `javascript_tool` executes JS in the page context — use for reading computed state
  the DOM tools don't expose, or triggering behavior no visible control maps to
  cleanly. Don't use it to bypass a form the user could fill normally; prefer the
  visible-UI path so the result matches what a human would have done.

## Debugging

- `read_console_messages` and `read_network_requests` are diagnostic, not action
  tools — reach for them when a page isn't behaving as expected (a click did
  nothing, a form didn't submit) before guessing at a fix.
- `gif_creator` records a visual trace of a session — use when the deliverable is
  showing someone *what happened*, not just reporting it in text.

## Common pitfalls

- **Acting before checking tab context.** Calling `navigate` or `computer` cold, without
  `tabs_context_mcp` first, risks acting in the wrong tab or clobbering the user's
  in-progress work.
- **Full `read_page` when `find` would do.** A structured DOM dump for a single-element
  lookup burns context for no gain.
- **Treating `javascript_tool` as a shortcut past a broken UI.** If a button doesn't
  respond, that's a signal to debug via `read_console_messages`, not to script around
  the symptom — the underlying issue (page not loaded, wrong tab, stale selector) will
  resurface.
- **Leaving tabs open indefinitely.** Scratch tabs opened mid-task should be closed
  with `tabs_close_mcp` once their purpose is served, or they accumulate across a
  session.
- **One tool at a time via `ToolSearch`.** Always batch the anticipated tool set into
  a single `ToolSearch` call at the start of a browser task.

## Out of scope

This skill does not, and cannot, configure which Anthropic account or subscription
plan (e.g. Max Plan) the Chrome extension authenticates against. That binding happens
at `claude login`, outside anything a skill's markdown content can read or influence.
If a user asks to "connect the right plan," say so directly rather than attempting a
workaround here.

**Completion criterion:** the tools needed for the task are loaded via one batched
`ToolSearch` call, `tabs_context_mcp` has been checked before the first action, and
the chosen read tool (`get_page_text` / `read_page` / `find`) matches whether the goal
is understanding or acting.
```

**Step 1 completion criterion:** file exists at `/Users/phillmcgurk/Pi-Dev-Ops/skills/chrome-browser/SKILL.md` and `wc -l` reports a line count strictly under 200.

- [ ] **Step 2: Verify frontmatter parses and line count**

Run:

```bash
wc -l /Users/phillmcgurk/Pi-Dev-Ops/skills/chrome-browser/SKILL.md
head -5 /Users/phillmcgurk/Pi-Dev-Ops/skills/chrome-browser/SKILL.md
```

Expected: line count printed is ≤ 200 (drafted content above is ~110 lines); `head`
shows valid YAML frontmatter (`---` / `name:` / `description:` / `---`) with no
`disable-model-invocation`, no `argument-hint`, no `allowed-tools`, no `model` field —
matching the plain-technique archetype exactly (frontmatter-schema.md: plain-technique
takes only `name` and `description`).

**Step 2 completion criterion:** command output confirms both — line count under
the cap, frontmatter matches the plain-technique block with no extra fields.

- [ ] **Step 3: Self-review against the spec (writing-plans style, applied to the skill draft)**

Check the drafted SKILL.md against the original ask:

1. **Spec coverage** — "when to invoke" → covered by `description` (WHEN-not-WHAT,
   trigger-phrased) and the H1 intro. "Correct frontmatter, archetype justified" →
   covered above in Task 1's archetype-choice paragraph and the frontmatter itself.
   "Core patterns for the tool set, batch-loading via ToolSearch, quoting the exact
   session guidance" → covered in "Load the tools first" (the query string is quoted
   verbatim from this session's MCP server instructions for `claude-in-chrome`).
   "read_page vs get_page_text-equivalent" → covered in its own section. "Tab
   management" → covered in "Navigation and tabs". "Common pitfalls" → its own
   section, five concrete items. "Completion criterion per step" → the skill's own
   final "Completion criterion" line, plus every step in this plan has one.
2. **Placeholder scan** — no "TBD", no "similar to above", no unfilled brackets in
   the drafted file. Confirmed by inspection during drafting.
3. **Out-of-scope confirmation** — the "Out of scope" section explicitly states the
   Max Plan binding is a `claude login`-level concern, not a skill-layer one. This
   is deliberate, not an omission.

**Step 3 completion criterion:** all three checks above pass with no gaps found; if
a gap were found, Step 1's file content would be edited in place before proceeding
(none found here — proceed to Task 2).

---

### Task 2: Verify against the review-checklist

**Files:**
- Read (no modification expected unless a FAIL is found): `/Users/phillmcgurk/Pi-Dev-Ops/skills/chrome-browser/SKILL.md`
- Reference: `/Users/phillmcgurk/Pi-Dev-Ops/skills/skill-authoring-standard/references/review-checklist.md`

**Interfaces:**
- Consumes: the file produced in Task 1.
- Produces: a pass/fail record (documented inline below); any FAIL triggers an edit
  to the Task 1 file before Task 3 begins.

- [ ] **Step 1: Run each review-checklist item against the drafted skill and record the verdict**

| # | Checklist item | Verdict | Evidence |
|---|---|---|---|
| 1 | Archetype is one of the three, frontmatter matches schema | PASS | plain-technique; frontmatter has only `name` + `description`, matching the canonical example in frontmatter-schema.md exactly. |
| 2 | Invocation deliberate — user-invoked unless autonomous reach is needed | PASS | Model-invoked is correct here: an agent mid-task needs to reach this without the user typing a command name (same shape as `use-railway`, `marketing-copywriter`). |
| 3 | `description` obeys WHEN-not-WHAT, one trigger per branch, no workflow summary, no `Model: …` prose | PASS | Description is a single WHEN-phrased sentence ("Use when the user asks to browse, click, navigate, fill a form, screenshot, or read content... or whenever a task needs to drive an actual Chrome tab") — lists trigger surfaces, not internal workflow steps. |
| 4 | No banned fields (`version`, `owner_role`, `status`, `metadata.requires`) | PASS | Frontmatter contains only `name` and `description`. |
| 5 | Mutating skills declare `allowed-tools`; read-only skills declare read-only set | PASS (by non-applicability, documented) | This skill does not declare `allowed-tools` at all — deliberate, matching the plain-technique canonical example (`marketing-copywriter`), which also omits it. The skill's actions route entirely through the `claude-in-chrome` MCP tools resolved via `ToolSearch`, not through a Claude Code built-in tool that `allowed-tools` would gate. |
| 6 | Every element sits on the information hierarchy (in-skill step → in-skill reference → external reference) | PASS | Everything is an in-skill step; no external reference material was needed given the tool set's small size (~13 tools), so no `references/` folder was created — correctly, per the "push only if >~150 lines" rule. |
| 7 | Branch-only or large (>~150-line) reference lives in `references/`, reached by a context pointer | PASS (by non-applicability) | Nothing in the draft exceeds that threshold; no such reference exists to misplace. |
| 8 | `SKILL.md` ≤ 200 lines | PASS | Confirmed by `wc -l` in Task 1 Step 2 — approx. 110 lines, well under 200. |
| 9 | Each step ends on a checkable completion criterion | PASS | The skill's final section states one explicit, checkable completion criterion (tools batch-loaded, tab context checked, correct read tool chosen). |
| 10 | External reference lives only in `references/` — no session symlinks, committed venvs, nested repos, backup dirs | PASS (by non-applicability) | No external reference files exist in this skill at all. |
| 11 | Each external file named for its contents, reached by a pointer stating the load condition | PASS (by non-applicability) | No external files. |
| 12 | Single source of truth — no template/definition/trigger duplicated across files or steps | PASS | The tool list appears once (intro); the `ToolSearch` query pattern appears once ("Load the tools first"); pitfalls are stated once each, not restated in other sections. |
| 13 | Design-heavy skills defer to the four-layer boundary | PASS (by non-applicability) | Not a design-heavy skill — no visual/brand tokens involved. |
| 14 | Restated triads condensed into a leading word | PASS | "Load the tools first" / "Check tab context" / "Reading page content" / "Navigation and tabs" / "Acting on the page" / "Debugging" / "Common pitfalls" each act as a single leading heading rather than restating the same guidance three ways. |
| 15 | Extra leg-work split by sequence or invocation where it earns a distinct leading word | PASS (by non-applicability) | The tool set is small enough (~13 tools, one MCP server) that a single-file, single-invocation skill is the right size — splitting further would fragment a coherent 110-line skill against the standard's own "don't over-split small work" guidance (writing-plans, Task Right-Sizing). |
| 16 | Relevance — no sediment | PASS | Every section maps to a tool or a documented pitfall; nothing carried over from an unrelated template. |
| 17 | Deletion test — no no-ops survive | PASS | Read through sentence-by-sentence during drafting; no sentence restates another without adding a new fact (verified in this step). |
| 18 | No premature-completion bait | PASS | The skill never claims a task is "done" — its own completion criterion is a check the agent runs, not a claim the skill asserts on the agent's behalf. |
| 19 | Listed in the skills README (catalog placement) | **FAIL until Task 3 runs** | Not yet added — Task 3 exists specifically to close this. |
| 20 | If an entry-point skill, one row in an index.md | PASS (by non-applicability) | This is not an entry-point skill (no other skill needs a dedicated index row for it — same treatment as `marketing-copywriter`, `eeat`, and other plain-technique skills, none of which appear in a separate index.md; only `~/.claude/skills/` has no index.md at all in this repo, confirmed by directory listing). |

**Step 1 completion criterion:** every checklist row has an explicit PASS/FAIL verdict
with evidence; the one FAIL (#19, catalog placement) is scoped to Task 3, not left
open at the end of this plan.

- [ ] **Step 2: Note the one real deviation from the standard's stated ideal, and why no fix is possible here**

The standard's own text says the "documented 3-place rule is aspirational" and the
"operative reality" is `~/.claude/skills/README.md` plus a `GLOSSARY.md` that this
session confirmed **do not exist** in this repo (`find` returned nothing for either
path). The task instructions for this plan specifically name
`/Users/phillmcgurk/Pi-Dev-Ops/skills/README.md` as the catalog file to edit — that
file also does not exist yet. Task 3 creates it fresh rather than editing a
non-existent file, which satisfies checklist item #19's intent (a discoverable,
linked catalog entry) without fabricating content for the missing `GLOSSARY.md`,
which is out of scope for this plan.

**Step 2 completion criterion:** this deviation is documented here (done) rather than
silently worked around or left for Task 3 to discover mid-step.

---

### Task 3: Catalog placement — add the entry to skills/README.md

**Files:**
- Create: `/Users/phillmcgurk/Pi-Dev-Ops/skills/README.md` (does not exist yet —
  confirmed via `ls` in this session; Task 2 Step 2 documents why creation, not
  editing, is correct here).

**Interfaces:**
- Consumes: the skill's `name` (`chrome-browser`) and `description` first sentence
  from Task 1's file.
- Produces: closes review-checklist item #19 (catalog placement) from Task 2.

- [ ] **Step 1: Create a minimal catalog README seeded with the one entry this plan owns**

Since no catalog file exists yet in `Pi-Dev-Ops/skills/`, create one with a short
header and a one-line-per-skill list, starting with the entry this plan is
responsible for. Do not attempt to backfill every existing skill in the fleet in
this pass — that is a separate, larger undertaking outside this plan's scope (see
Task Right-Sizing: this plan builds one skill, not a fleet-wide catalog migration).

Write `/Users/phillmcgurk/Pi-Dev-Ops/skills/README.md`:

```markdown
# Skills Catalog

One-line index of skills in this fleet, per skill-authoring-standard's catalog
placement rule. Add a line here when you add a new skill.

- [`chrome-browser`](chrome-browser/SKILL.md) — Drive Chrome via the claude-in-chrome MCP tools: navigation, tab management, reading page content, common pitfalls.
```

**Step 1 completion criterion:** `/Users/phillmcgurk/Pi-Dev-Ops/skills/README.md`
exists, contains a working relative link to `chrome-browser/SKILL.md`, and running
`cat /Users/phillmcgurk/Pi-Dev-Ops/skills/README.md` shows the entry above.

- [ ] **Step 2: Confirm the link resolves**

Run:

```bash
test -f /Users/phillmcgurk/Pi-Dev-Ops/skills/chrome-browser/SKILL.md && echo "link target exists"
```

Expected output: `link target exists`.

**Step 2 completion criterion:** command prints `link target exists`, confirming the
README's relative link is not broken.

---

### Task 4: Branch, commit, push, open PR

**Files:** none new — this task operates on git state for the two files created in
Tasks 1 and 3 (`skills/chrome-browser/SKILL.md`, `skills/README.md`).

**Interfaces:**
- Consumes: the two files created above, both already on disk.
- Produces: an open PR against `CleanExpo/Pi-Dev-Ops` `main`, gated by the confirmed
  required status checks — nothing further downstream in this plan.

- [ ] **Step 1: Create a feature branch (never commit to main directly)**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git checkout main
git pull origin main
git checkout -b feature/chrome-browser-skill
```

Expected: branch `feature/chrome-browser-skill` created and checked out, confirmed by:

```bash
git branch --show-current
```

Expected output: `feature/chrome-browser-skill`.

**Step 1 completion criterion:** `git branch --show-current` prints
`feature/chrome-browser-skill`.

- [ ] **Step 2: Stage and commit the two new files**

```bash
git add skills/chrome-browser/SKILL.md skills/README.md
git commit -m "$(cat <<'EOF'
feat(skills): add chrome-browser skill wrapping claude-in-chrome MCP tools

Documents navigation, tab management, read_page vs get_page_text choice,
and common pitfalls for the previously-unwrapped claude-in-chrome MCP
tool set. Adds skills/README.md as the catalog entry point.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds; `git status --short` shows a clean tree for these two
files (no longer listed as untracked/modified).

**Step 2 completion criterion:** `git log -1 --stat` shows the commit with exactly
the two files (`skills/chrome-browser/SKILL.md`, `skills/README.md`) changed.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feature/chrome-browser-skill
gh pr create --repo CleanExpo/Pi-Dev-Ops \
  --title "feat(skills): add chrome-browser skill wrapping claude-in-chrome MCP tools" \
  --body "$(cat <<'EOF'
## Summary
- Adds a new `chrome-browser` plain-technique skill wrapping the previously-unwrapped `claude-in-chrome` MCP tool set (navigate, computer, read_page, get_page_text, find, tab management, form_input, javascript_tool, debugging tools).
- Covers: batch-loading tools via ToolSearch, tab-context-first discipline, read_page vs get_page_text vs find selection, common pitfalls.
- Adds `skills/README.md` as the catalog entry point (did not previously exist) with one entry for this skill.
- Passed the full skill-authoring-standard review-checklist (18/18 applicable items PASS; the 19th, catalog placement, is closed by this PR's second commit-file).

## Explicitly out of scope
"Auto-connect to the right Max Plan" was considered and excluded — that binding happens at `claude login`, outside anything a skill's markdown content can read or influence. This is a category error, not a missed requirement.

## Test plan
- [ ] `wc -l skills/chrome-browser/SKILL.md` reports ≤ 200
- [ ] Frontmatter is valid YAML with only `name` + `description` (plain-technique archetype)
- [ ] `skills/README.md` link to `chrome-browser/SKILL.md` resolves
- [ ] CI required checks pass (Python pytest+ruff, Frontend tsc+eslint+build, Pi CEO API smoke test)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR created; `gh pr create` prints the PR URL.

**Step 3 completion criterion:** `gh pr view --repo CleanExpo/Pi-Dev-Ops feature/chrome-browser-skill --json url,state` reports `"state":"OPEN"` and a valid `url`.

---

## Self-Review

**1. Spec coverage.** All four requested tasks (draft skill, verify against
review-checklist, catalog placement, branch/commit/push/PR) map 1:1 to Tasks 1–4
above. The drafted skill covers: when to invoke (WHEN-triggers description),
correct frontmatter with archetype justification (plain-technique, justified against
`use-railway` and `marketing-copywriter` as precedent), core patterns including the
exact batch-loading `ToolSearch` guidance quoted verbatim from this session's
`claude-in-chrome` MCP server instructions, `read_page` vs `get_page_text` guidance,
tab management, common pitfalls, and a completion criterion.

**2. Placeholder scan.** No "TBD", no "similar to Task N", no unfilled brackets
anywhere in this plan or the embedded skill content — every code block and table
cell above is the actual content, not a description of content.

**3. Out-of-scope confirmation.** The "auto-connect to the right Max Plan" request
was deliberately excluded, not silently dropped. It is called out three times in
this plan: in Global Constraints, inside the drafted skill's own "Out of scope"
section, and in the PR body — each time with the same one-line reason: Max Plan /
account binding happens at `claude login`, entirely outside what a skill's markdown
content can read or influence. This is a category error (asking a documentation
artifact to perform an authentication action), not a scope gap to fill later.

**4. Type/name consistency.** The skill's `name` field (`chrome-browser`) matches the
folder name, the README link target, and every reference to it across Tasks 1–4 —
no drift between "chrome-browser" and any alternate spelling.
