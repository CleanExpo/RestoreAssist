# Nexus–Handoff Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-connect Nexus's dispatch procedure to the existing `session-handoff` / `resume-from-handoff` skills (load a prior handoff before framing a task, write a new one after a dispatched task completes), and give RestoreAssist Claude Code sessions an automatic nudge toward the same two skills on session Stop and SessionStart.

**Architecture:** Two edits to `Pi-Dev-Ops/skills/nexus/SKILL.md`'s Procedure section (steps 2 and a new step 5) so any caller of Nexus gets handoff continuity for free, with no change to `session-handoff`/`resume-from-handoff` themselves. Separately, two new hook entries in `RestoreAssist/.claude/settings.local.json` that fire on `Stop` and `SessionStart` — additive to the existing `stop-verifier.sh` Stop hook and the existing `compact`-matcher SessionStart hook. Claude Code hooks cannot force skill invocation (confirmed below); the new hooks inject an `additionalContext` nudge that the running session is expected to act on, mirroring the block+reason pattern `stop-verifier.sh` already uses.

**Tech Stack:** Markdown skill files (Pi-Dev-Ops), bash hook scripts + `.claude/settings.local.json` (RestoreAssist), `jq` for JSON hook output.

## Global Constraints

- Nexus's `references/NEXUS_PROMPT.md` body is recalibrated monthly and capped at 120 lines — **do not touch it**; this plan only edits `SKILL.md`'s Procedure section.
- `skill-authoring-standard` caps `SKILL.md` at ≤200 lines (`references/review-checklist.md` item "2. Structure").
- Pi-Dev-Ops `main` has branch protection: required status checks (`Python (pytest + ruff)`, `Frontend (tsc + eslint + build)`, `Pi CEO API smoke test`), required linear history, required conversation resolution, no force-push, no deletions. All work lands via a feature branch + PR — confirmed via `gh api repos/CleanExpo/Pi-Dev-Ops/branches/main/protection`.
- RestoreAssist hook edits go in `.claude/settings.local.json`, not `.claude/settings.json` — confirmed by this repo's own history (commit `455bb64d` edited hook blocks in `.claude/settings.local.json`; `.claude/settings.json` holds only the stable `stop-verifier.sh` Stop hook and `attribution` setting).
- Existing RestoreAssist hooks that must keep working, verbatim:
  - `.claude/settings.json` → `Stop` → `.claude/hooks/stop-verifier.sh` (multi-domain verifier; blocks via JSON `decision`).
  - `.claude/settings.local.json` → `SessionStart` (matcher `compact`) → inline `echo`-based post-compaction git-context dump.
  - `.claude/settings.local.json` → `PreToolUse` → destructive-command guard and sensitive-file guard.
- **Claude Code hook mechanics (verified, not assumed):** a hook's `command` is a shell command; Claude Code only interprets its exit code and stdout/JSON — there is no mechanism for a hook to force a skill/slash-command to run. A `SessionStart` hook can inject `additionalContext` (via plain stdout or `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}`); a `Stop` hook can block (`{"hookSpecificOutput":{"hookEventName":"Stop","decision":"block","additionalContext":"..."}}` or exit code 2) and supply a reason. In both cases the running Claude session reads the injected text and **autonomously decides** whether to run `/resume-from-handoff` or `/session-handoff` — the hook cannot compel it. This plan's hooks are written to match that real contract; do not claim they "guarantee" invocation.
- `automation: manual` in `session-handoff`/`resume-from-handoff` frontmatter is **not** part of the skill-authoring-standard frontmatter schema (`references/frontmatter-schema.md` lists only `name`, `description`, `disable-model-invocation`, `argument-hint`, `allowed-tools`, `model` per archetype, plus a banned-fields list of `version`/`owner_role`/`status`/`metadata.requires` — `automation` appears in neither). It does not block programmatic/procedural invocation from another skill's text (see Task 2 for the full reasoning). No frontmatter change is required for Task 1 to work.
- `session-handoff`'s Phase 0 (`scripts/handoff-loop.sh`) and its output directory (`docs/session-handoffs/`) **do not exist in RestoreAssist today** — confirmed absent via `find`/`ls`. Task 5's end-to-end test will hit this gap; Task 3 documents the fallback behavior explicitly rather than silently assuming the script exists.

---

### Task 1: Add the Nexus procedure hooks (Pi-Dev-Ops PR)

**Files:**
- Modify: `/Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md` (Procedure section, lines 19–37)

**Interfaces:**
- Consumes: `resume-from-handoff` skill (invoked by name, `$ARGUMENTS` = none → "look for the most recent handoff under `.session-handoff/` or in the current context"), `session-handoff` skill (invoked by name, `$ARGUMENTS` = the dispatched task's scope string).
- Produces: no new function signatures — this is prose-only. Later tasks (2) reference the exact step numbers introduced here ("step 2", "step 5") — do not renumber without updating Task 2's references.

- [ ] **Step 1: Create a feature branch**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git status --short
git checkout main
git pull origin main
git checkout -b feature/nexus-handoff-connector
```

Expected: branch created and checked out, confirmed by `git branch --show-current` printing `feature/nexus-handoff-connector`.

- [ ] **Step 2: Edit step 2 of the Procedure to load a prior handoff before filling `{TASK}`**

Open `/Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md`. Replace the existing step 2 block:

```markdown
2. Replace `{TASK}` with the complete task — include the why ("I'm working on X for Y;
   they need Z. With that in mind: …") and any hard constraints (hands-off surfaces,
   ff-only mandates, output contracts). The wrapper does not carry task context for you.
   - **Completion criterion:** no `{TASK}` placeholder remains; the task states its why
     and constraints.
```

with:

```markdown
2. Before filling `{TASK}`, check for a prior handoff scoped to this work: invoke
   `resume-from-handoff` (no arguments — it finds the most recent handoff itself). If it
   reports MATCH or MINOR DRIFT, fold its "Pick up here" pickup point and open questions
   into the task instead of re-deriving them from scratch. If it reports MATERIAL DRIFT,
   CANNOT RESUME, or finds no handoff, proceed with step 2 unchanged — a missing or stale
   handoff is not a blocker, just a missed shortcut.
   - **Completion criterion:** a handoff lookup was attempted (found-and-folded-in, or
     confirmed absent/stale) before the task is drafted.
3. Replace `{TASK}` with the complete task — include the why ("I'm working on X for Y;
   they need Z. With that in mind: …") and any hard constraints (hands-off surfaces,
   ff-only mandates, output contracts). The wrapper does not carry task context for you.
   - **Completion criterion:** no `{TASK}` placeholder remains; the task states its why
     and constraints.
```

Note this splits the old step 2 into new step 2 (handoff check) and step 3 (fill `{TASK}`, unchanged body) — every step below it shifts up by one. Continue to Step 3 of this plan task to renumber the rest.

- [ ] **Step 3: Renumber the remaining Procedure steps and add the new step 5 (session-handoff on completion)**

The old steps 3 and 4 become new steps 4 and 5's *predecessor* — insert the new handoff-write step as the new step 6 (after the old step 4, now step 5). Replace the remainder of the Procedure section (old steps 3–4) so the full section reads exactly:

```markdown
4. Dispatch: pass the filled prompt verbatim as the subagent prompt (pick the model tier
   per the prompt's own calibration section), the SDK `system`+user pair, or another CLI —
   non-Claude-Code harness instructions are in [`references/cross-cli.md`](references/cross-cli.md);
   look them up there.
   - **Completion criterion:** the receiving model got the body verbatim — no partial
     paste, no appended show-your-reasoning instructions (`reasoning_extraction` trap).
5. On return, verify the report against the prompt's own contract before trusting it:
   claims grounded in tool results, mandate compliance (e.g. reflog for git mandates),
   scope untouched. Independent spot-check ≥1 claim.
   - **Completion criterion:** at least one claim independently re-verified, or the
     discrepancy reported.
6. Before returning control, write a handoff scoped to the completed task: invoke
   `session-handoff` with the task's scope string as its argument. This runs on the
   dispatching session, not the sub-Fable model — it records what the dispatched task did,
   what shipped, and where a future Nexus call (or a human) picks up next, so step 2's
   lookup has something to find. Skip only if the task was pure research/read-only with
   nothing to hand off (say so explicitly rather than silently omitting the step).
   - **Completion criterion:** `session-handoff` ran and produced a report, or its
     omission was stated with a reason.
```

- [ ] **Step 4: Read the full edited file back and confirm the Procedure section is coherent**

```bash
sed -n '19,50p' /Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md
```

Expected: six numbered steps, 1 (read the prompt) through 6 (write handoff), each with a `**Completion criterion:**` sub-bullet, no leftover reference to the old step numbering, no duplicate step 2.

- [ ] **Step 5: Verify the 200-line cap**

```bash
wc -l /Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md
```

Expected: a number well under 200 (file was 45 lines before this edit; the two new steps add roughly 14 lines, landing around 59 — confirm the actual printed count is <200; if it is not, something else changed and needs investigation before continuing).

- [ ] **Step 6: Commit**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git add skills/nexus/SKILL.md
git commit -m "$(cat <<'EOF'
feat(nexus): connect Nexus procedure to session-handoff/resume-from-handoff

Nexus now checks for a prior handoff before framing {TASK} (new step 2) and
writes a scoped handoff before returning control after a dispatched task
completes (new step 6). Closes the gap where Nexus had zero functional
connection to the handoff skills.
EOF
)"
```

Expected: commit created on `feature/nexus-handoff-connector`.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin feature/nexus-handoff-connector
gh pr create --title "feat(nexus): connect Nexus procedure to session-handoff/resume-from-handoff" --body "$(cat <<'EOF'
## Summary
- Nexus step 2 now checks `resume-from-handoff` before filling `{TASK}`, folding in a MATCH/MINOR DRIFT pickup point where one exists.
- New Nexus step 6 invokes `session-handoff` scoped to the completed task before returning control, so future Nexus calls have something to resume from.
- `NEXUS_PROMPT.md` is untouched (no change to the 120-line-capped prompt body).

## Test plan
- [ ] `wc -l skills/nexus/SKILL.md` stays under the 200-line skill-authoring-standard cap
- [ ] Manual read-through: Procedure section has 6 coherently numbered steps, each with a completion criterion
- [ ] CI: Python (pytest + ruff), Frontend (tsc + eslint + build), Pi CEO API smoke test all green (required checks on `main`)
EOF
)"
```

Expected: PR URL printed; CI checks begin running per branch protection (`Python (pytest + ruff)`, `Frontend (tsc + eslint + build)`, `Pi CEO API smoke test (28 checks)`).

---

### Task 2: Un-gate session-handoff and resume-from-handoff for programmatic invocation

**Files:** none modified in this task — it is a documented decision, verified against the actual schema, not a code change.

**Interfaces:**
- Consumes: `/Users/phillmcgurk/Pi-Dev-Ops/skills/skill-authoring-standard/references/frontmatter-schema.md` (already read in full this session).
- Produces: a written decision this plan's Task 1 depends on (Task 1 assumes no frontmatter change is needed — this task is where that assumption is proven, not asserted).

- [ ] **Step 1: Confirm what `automation: manual` actually is**

`grep -rn "automation:" /Users/phillmcgurk/Pi-Dev-Ops/skills/*/SKILL.md` (already run this session) shows 25 skills using `automation: manual|hybrid|automatic` as a frontmatter field. Cross-referencing `references/frontmatter-schema.md`'s three archetype tables (`command-skill`, `agent-role`, `plain-technique`) and its "Banned fields" list (`version`, `owner_role`, `status`, `metadata.requires`): **`automation` appears in neither the recognized-fields table nor the banned-fields list.** It is not part of the schema. `session-handoff`'s own frontmatter (`owner_role: Tier-Architect...`, `status: active`, `automation: manual`) in fact violates the schema on two counts already (`owner_role` and `status` are explicitly banned) — the file predates or diverges from the standard and has not been reconciled. `automation: manual` is documentation intent, not an enforced switch.

- **Completion criterion:** confirmed by direct comparison against `frontmatter-schema.md`'s field tables — no field named `automation` exists there.

- [ ] **Step 2: Identify the actual invocation-gating field**

The schema's real gate is `disable-model-invocation: true` (see `frontmatter-schema.md` line 34: "the one switch that makes a skill user-invoked (zero context load)"). Only `context-cockpit` in the whole Pi-Dev-Ops skill set sets it. Neither `session-handoff` nor `resume-from-handoff` sets `disable-model-invocation` at all — their frontmatter (already read in full) has `name`, `description`, `owner_role`, `status`, `automation` and nothing else. Absence of `disable-model-invocation: true` means these two skills are, per the schema's own default rule ("Default to user-invoked... unless the agent or another skill must reach it autonomously"), currently in an **undecided** state rather than a hard-blocked one — no field on either file prevents a skill or agent from invoking them.

- **Completion criterion:** confirmed both files (re-read this session) contain no `disable-model-invocation` line.

- [ ] **Step 3: Distinguish "model auto-triggers unprompted" from "Nexus invokes procedurally"**

The mechanism `disable-model-invocation: true` blocks is the **model's own decision to reach for a skill it noticed matches the current context** (autonomous pattern-matching against `description`). It says nothing about a *skill's own procedure text* naming another skill and instructing it be invoked — that is Nexus's Procedure step (new step 2 / step 6 from Task 1) directing execution, functionally identical to a human typing `/session-handoff` at the point Nexus's instructions say to. `nexus/SKILL.md` itself already documents this exact pattern for itself: its "Autonomy contract" section states "Model-invocable by design: any skill or agent dispatching work to a lower tier wraps it with this skill's prompt." Nexus invoking `session-handoff`/`resume-from-handoff` from within its own procedure is the same category of call, not the category `disable-model-invocation` exists to block.

- **Completion criterion:** the distinction is stated in this plan (done) and matches how `nexus/SKILL.md`'s own autonomy contract describes itself.

- [ ] **Step 4: Decision**

**No frontmatter change to `session-handoff/SKILL.md` or `resume-from-handoff/SKILL.md` is required for Task 1's Nexus edit to work.** `automation: manual` is a non-normative, non-schema field that does not gate procedural invocation from another skill's text; the schema's actual gate (`disable-model-invocation`) is absent from both files and, per the schema's own definition, would not have blocked this pattern even if present, since it governs unprompted model pattern-matching, not directed dispatch from a calling skill's procedure. Recommend, as a separate follow-up (not in scope for this plan — flagged, not actioned): reconcile `session-handoff`/`resume-from-handoff` frontmatter against the schema by removing the banned `owner_role`/`status` fields and either deleting `automation: manual` (superseded by nothing, since no schema field replaces its intent) or leaving it as harmless legacy metadata. This plan does not touch those files, honoring the instruction to hard-connect existing skills, not redesign them.

- **Completion criterion:** decision recorded above; Task 1 proceeds without a frontmatter PR to either skill.

---

### Task 3: Wire the Stop→session-handoff hook

**Files:**
- Create: `/Users/phillmcgurk/RestoreAssist/.claude/hooks/stop-handoff-nudge.sh`
- Modify: `/Users/phillmcgurk/RestoreAssist/.claude/settings.local.json`

**Interfaces:**
- Consumes: nothing from earlier tasks (independent of Task 1/2 — this wires RestoreAssist's own hooks, unrelated repo).
- Produces: a `Stop` hook entry additive to the existing `.claude/settings.json` `stop-verifier.sh` Stop hook — **both run**, because Claude Code executes all hook entries registered for an event; `settings.json` and `settings.local.json` are merged, not exclusive.

- [ ] **Step 1: Confirm the current merged Stop hook state before editing**

```bash
cd /Users/phillmcgurk/RestoreAssist
python3 -c "
import json
a = json.load(open('.claude/settings.json'))
b = json.load(open('.claude/settings.local.json'))
print('settings.json Stop:', json.dumps(a.get('hooks', {}).get('Stop', []), indent=2))
print('settings.local.json Stop:', json.dumps(b.get('hooks', {}).get('Stop', []), indent=2))
"
```

Expected output: `settings.json Stop` shows the one `stop-verifier.sh` entry; `settings.local.json Stop` shows `[]` (empty — confirmed earlier this session). This is the baseline the diff below is against.

- [ ] **Step 2: Write the hook script**

```bash
mkdir -p /Users/phillmcgurk/RestoreAssist/.claude/hooks
```

Create `/Users/phillmcgurk/RestoreAssist/.claude/hooks/stop-handoff-nudge.sh`:

```bash
#!/usr/bin/env bash
# stop-handoff-nudge.sh — nudge toward /session-handoff on Stop.
#
# Runs alongside (not instead of) stop-verifier.sh — Claude Code fires every
# registered Stop hook. This hook never blocks Stop and never runs
# session-handoff itself: a hook can only inject text via additionalContext,
# it cannot force skill invocation (Claude Code hooks have no such
# mechanism). The running session reads the nudge and decides whether to
# run /session-handoff before actually stopping.
#
# Escape hatch: set CLAUDE_HANDOFF_NUDGE_SKIP=1 to silence this hook (e.g.
# for rapid iteration loops where a handoff on every Stop is noise).
#
# Stdin: Stop-hook payload JSON (unused here — no need to parse it)
# Stdout: additionalContext JSON, or nothing
# Exit: ALWAYS 0 (never blocks Stop)

set -uo pipefail

if [[ "${CLAUDE_HANDOFF_NUDGE_SKIP:-}" == "1" ]]; then
  exit 0
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# session-handoff's Phase 0 gate script does not exist in this repo yet
# (scripts/handoff-loop.sh) — if it's added later this hook picks it up
# automatically; until then, note the gap in the nudge so the session
# doesn't silently skip the handoff thinking it already ran the gate.
GATE_NOTE=""
if [[ ! -x "$REPO_DIR/scripts/handoff-loop.sh" ]]; then
  GATE_NOTE=" Note: scripts/handoff-loop.sh does not exist in this repo yet, so session-handoff's Phase 0 gate will report that explicitly rather than run it — write the handoff anyway with whatever verification was actually done this session."
fi

jq -n --arg ctx "Before this session ends, consider running /session-handoff to record what was done, what shipped, and where the next session should pick up.${GATE_NOTE}" \
  '{hookSpecificOutput: {hookEventName: "Stop", additionalContext: $ctx}}'

exit 0
```

```bash
chmod +x /Users/phillmcgurk/RestoreAssist/.claude/hooks/stop-handoff-nudge.sh
```

- [ ] **Step 3: Test the script standalone before wiring it**

```bash
echo '{}' | /Users/phillmcgurk/RestoreAssist/.claude/hooks/stop-handoff-nudge.sh
```

Expected: prints valid JSON of the shape `{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"Before this session ends... Note: scripts/handoff-loop.sh does not exist..."}}`, exits 0.

```bash
echo '{}' | CLAUDE_HANDOFF_NUDGE_SKIP=1 /Users/phillmcgurk/RestoreAssist/.claude/hooks/stop-handoff-nudge.sh; echo "exit=$?"
```

Expected: no output, `exit=0`.

- [ ] **Step 4: Edit `.claude/settings.local.json` to add the Stop hook entry**

Current `hooks.Stop` in `/Users/phillmcgurk/RestoreAssist/.claude/settings.local.json` is `[]`. Exact diff:

```diff
   "hooks": {
     "PostToolUse": [],
     "PreToolUse": [
       {
         "matcher": "Bash",
         "hooks": [
           {
             "type": "command",
             "command": "echo \"$CLAUDE_TOOL_INPUT\" | grep -qiE '(rm -rf|--force|--no-verify|DROP TABLE|TRUNCATE|reset --hard)' && echo 'BLOCKED: destructive command detected' && exit 1 || exit 0"
           }
         ]
       },
       {
         "matcher": "Edit|Write",
         "hooks": [
           {
             "type": "command",
             "command": "echo \"$CLAUDE_FILE_PATH\" | grep -qiE '(\\.env|\\.secret|\\.key|\\.pem|credentials)' && echo 'BLOCKED: editing sensitive file' && exit 1 || exit 0"
           }
         ]
       }
     ],
     "SessionStart": [
       {
         "matcher": "compact",
         "hooks": [
           {
             "type": "command",
             "command": "echo \"== Post-Compaction Context ==\" && echo \"Branch: $(git branch --show-current 2>/dev/null)\" && echo \"Recent commits:\" && git log --oneline -5 2>/dev/null && echo \"Modified files:\" && git diff --name-only HEAD~3 2>/dev/null | head -20 && echo \"== End Context ==\""
           }
         ]
       }
     ],
-    "Stop": []
+    "Stop": [
+      {
+        "hooks": [
+          {
+            "type": "command",
+            "command": ".claude/hooks/stop-handoff-nudge.sh"
+          }
+        ]
+      }
+    ]
   }
```

Apply it with the Edit tool against the real file (matching its exact current formatting — 2-space indent, as read earlier this session):

- Old string: `    "Stop": []`
- New string:
```json
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/stop-handoff-nudge.sh"
          }
        ]
      }
    ]
```

- [ ] **Step 5: Validate the merged JSON is well-formed and both Stop hooks are present**

```bash
python3 -c "
import json
a = json.load(open('/Users/phillmcgurk/RestoreAssist/.claude/settings.json'))
b = json.load(open('/Users/phillmcgurk/RestoreAssist/.claude/settings.local.json'))
print('OK: both files parse as valid JSON')
print('settings.json Stop hooks:', [h['command'] for entry in a['hooks']['Stop'] for h in entry['hooks']])
print('settings.local.json Stop hooks:', [h['command'] for entry in b['hooks']['Stop'] for h in entry['hooks']])
"
```

Expected:
```
OK: both files parse as valid JSON
settings.json Stop hooks: ['.claude/hooks/stop-verifier.sh']
settings.local.json Stop hooks: ['.claude/hooks/stop-handoff-nudge.sh']
```

Both entries exist independently — Claude Code fires every hook registered for `Stop` across both files, so `stop-verifier.sh` is untouched and still runs.

- [ ] **Step 6: Commit**

```bash
cd /Users/phillmcgurk/RestoreAssist
git add .claude/hooks/stop-handoff-nudge.sh .claude/settings.local.json
git commit -m "$(cat <<'EOF'
feat(hooks): add Stop hook nudging toward /session-handoff

Additive to the existing stop-verifier.sh Stop hook in .claude/settings.json
— both fire on every Stop. This hook cannot force /session-handoff to run
(Claude Code hooks have no such mechanism); it injects additionalContext
that the session reads and acts on, same pattern stop-verifier.sh already
uses for its block/reason contract.
EOF
)"
```

Expected: commit created.

---

### Task 4: Wire the SessionStart→resume-from-handoff hook

**Files:**
- Create: `/Users/phillmcgurk/RestoreAssist/.claude/hooks/session-start-resume-nudge.sh`
- Modify: `/Users/phillmcgurk/RestoreAssist/.claude/settings.local.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a second `SessionStart` array entry alongside the existing `compact`-matcher entry. **Verified, not assumed:** the Plaud-recording SessionStart hook found earlier this session lives in the **global** `~/.claude/settings.json` (`SessionStart` → `pull_latest_plaud.py`, no matcher — fires on every session start machine-wide), not in this repo's local settings. RestoreAssist's own `SessionStart` array has exactly one entry, matcher `compact` (post-compaction git-context dump). The new entry does not touch or duplicate either.

- [ ] **Step 1: Re-confirm no repo-local SessionStart conflict before editing**

```bash
cd /Users/phillmcgurk/RestoreAssist
python3 -c "
import json
b = json.load(open('.claude/settings.local.json'))
print(json.dumps(b['hooks']['SessionStart'], indent=2))
"
```

Expected: a single-element array, `matcher: "compact"`, the post-compaction `echo`/`git log` command — confirming the earlier read this session and ruling out a second local entry that would need merging differently.

- [ ] **Step 2: Write the hook script**

Create `/Users/phillmcgurk/RestoreAssist/.claude/hooks/session-start-resume-nudge.sh`:

```bash
#!/usr/bin/env bash
# session-start-resume-nudge.sh — nudge toward /resume-from-handoff on
# SessionStart.
#
# Fires on "startup" and "resume" (no matcher = all SessionStart events,
# including "compact" — see Step 3 note on why that overlap is harmless).
# Only meaningful when a handoff actually exists to resume from; skips
# silently otherwise so a brand-new session isn't told to resume nothing.
#
# Like stop-handoff-nudge.sh, this cannot force /resume-from-handoff to run
# — Claude Code hooks have no mechanism to compel skill invocation. It
# injects additionalContext; the new session reads it and decides.
#
# Escape hatch: set CLAUDE_HANDOFF_NUDGE_SKIP=1 to silence this hook.
#
# Stdin: SessionStart-hook payload JSON (unused)
# Stdout: additionalContext JSON, or nothing
# Exit: ALWAYS 0

set -uo pipefail

if [[ "${CLAUDE_HANDOFF_NUDGE_SKIP:-}" == "1" ]]; then
  exit 0
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HANDOFF_DIR="$REPO_DIR/docs/session-handoffs"

if [[ ! -d "$HANDOFF_DIR" ]]; then
  exit 0
fi

LATEST=$(ls -t "$HANDOFF_DIR"/handoff-*.md 2>/dev/null | head -1)
if [[ -z "$LATEST" ]]; then
  exit 0
fi

jq -n --arg ctx "A prior session handoff exists at $LATEST. Consider running /resume-from-handoff before starting new work, to verify repo state against it and pick up where it left off." \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'

exit 0
```

```bash
chmod +x /Users/phillmcgurk/RestoreAssist/.claude/hooks/session-start-resume-nudge.sh
```

- [ ] **Step 3: Test the script standalone**

```bash
echo '{}' | /Users/phillmcgurk/RestoreAssist/.claude/hooks/session-start-resume-nudge.sh; echo "exit=$?"
```

Expected: no output (since `docs/session-handoffs/` does not exist yet per this session's findings), `exit=0`.

```bash
mkdir -p /tmp/handoff-nudge-test/docs/session-handoffs
echo "test handoff" > /tmp/handoff-nudge-test/docs/session-handoffs/handoff-20260703.md
REPO_DIR_OVERRIDE=1 bash -c '
  REPO_DIR=/tmp/handoff-nudge-test
  HANDOFF_DIR="$REPO_DIR/docs/session-handoffs"
  LATEST=$(ls -t "$HANDOFF_DIR"/handoff-*.md 2>/dev/null | head -1)
  jq -n --arg ctx "A prior session handoff exists at $LATEST." "{hookSpecificOutput: {hookEventName: \"SessionStart\", additionalContext: \$ctx}}"
'
rm -rf /tmp/handoff-nudge-test
```

Expected: prints `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"A prior session handoff exists at /tmp/handoff-nudge-test/docs/session-handoffs/handoff-20260703.md."}}` — confirms the detection logic works once a handoff file exists (this inline variant substitutes the path directly since the real script derives `REPO_DIR` from `BASH_SOURCE`, which isn't meaningful for an ad-hoc `bash -c` test).

- [ ] **Step 4: Edit `.claude/settings.local.json` to add the second SessionStart entry**

Exact diff (appending a new array element after the existing `compact` entry, no matcher so it fires on every `SessionStart` event type):

```diff
     "SessionStart": [
       {
         "matcher": "compact",
         "hooks": [
           {
             "type": "command",
             "command": "echo \"== Post-Compaction Context ==\" && echo \"Branch: $(git branch --show-current 2>/dev/null)\" && echo \"Recent commits:\" && git log --oneline -5 2>/dev/null && echo \"Modified files:\" && git diff --name-only HEAD~3 2>/dev/null | head -20 && echo \"== End Context ==\""
           }
         ]
+      },
+      {
+        "hooks": [
+          {
+            "type": "command",
+            "command": ".claude/hooks/session-start-resume-nudge.sh"
+          }
+        ]
       }
     ],
```

Apply with the Edit tool:

- Old string:
```json
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"== Post-Compaction Context ==\" && echo \"Branch: $(git branch --show-current 2>/dev/null)\" && echo \"Recent commits:\" && git log --oneline -5 2>/dev/null && echo \"Modified files:\" && git diff --name-only HEAD~3 2>/dev/null | head -20 && echo \"== End Context ==\""
          }
        ]
      }
    ],
```
- New string:
```json
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"== Post-Compaction Context ==\" && echo \"Branch: $(git branch --show-current 2>/dev/null)\" && echo \"Recent commits:\" && git log --oneline -5 2>/dev/null && echo \"Modified files:\" && git diff --name-only HEAD~3 2>/dev/null | head -20 && echo \"== End Context ==\""
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/session-start-resume-nudge.sh"
          }
        ]
      }
    ],
```

Note: this new entry has no `matcher`, so it fires on `startup`, `resume`, and `compact` alike (the `compact` entry's own hook still fires too — both run on a compaction event, which is harmless since the resume-nudge script exits silently when there's nothing to resume, and prints an *additional*, non-conflicting context block when there is).

- [ ] **Step 5: Validate the merged JSON and confirm both SessionStart entries independently present**

```bash
python3 -c "
import json
b = json.load(open('/Users/phillmcgurk/RestoreAssist/.claude/settings.local.json'))
print('OK: valid JSON')
entries = b['hooks']['SessionStart']
print('SessionStart entry count:', len(entries))
for e in entries:
    print(' matcher:', e.get('matcher', '(none)'), '-> command:', e['hooks'][0]['command'][:60])
"
```

Expected:
```
OK: valid JSON
SessionStart entry count: 2
 matcher: compact -> command: echo "== Post-Compaction Context ==" && echo "Branch: $(g
 matcher: (none) -> command: .claude/hooks/session-start-resume-nudge.sh
```

- [ ] **Step 6: Confirm no conflict with the global Plaud SessionStart hook**

```bash
python3 -c "
import json
g = json.load(open('/Users/phillmcgurk/.claude/settings.json'))
print(json.dumps(g['hooks']['SessionStart'], indent=2))
"
```

Expected: the Plaud `pull_latest_plaud.py` entry, scoped globally with no matcher, `async: true`. This runs independently of (and concurrently with) the two RestoreAssist-local `SessionStart` entries — Claude Code merges global and project-local hooks for the same event, all fire, none are mutually exclusive. No edit needed here; this step is verification only.

- [ ] **Step 7: Commit**

```bash
cd /Users/phillmcgurk/RestoreAssist
git add .claude/hooks/session-start-resume-nudge.sh .claude/settings.local.json
git commit -m "$(cat <<'EOF'
feat(hooks): add SessionStart hook nudging toward /resume-from-handoff

Additive to the existing compact-matcher SessionStart hook and the global
Plaud-pull SessionStart hook in ~/.claude/settings.json — all three fire
independently. Only emits a nudge when docs/session-handoffs/ actually
contains a handoff file; silent no-op otherwise.
EOF
)"
```

Expected: commit created.

---

### Task 5: End-to-end verification

**Files:** none created or modified — this task runs the wired hooks against a real session and confirms the loop closes.

**Interfaces:**
- Consumes: everything from Tasks 3–4 (RestoreAssist hooks) and, indirectly, Task 1 (Nexus procedure — verified separately in Pi-Dev-Ops CI per Task 1 Step 7, not re-tested here since Nexus dispatch is out of scope for a RestoreAssist-only session).
- Produces: a real `docs/session-handoffs/handoff-*.md` file, proving the hook-nudge → skill-invocation → file-write path is unbroken end to end for a human operator following the nudge (not proving unattended automation, since Task 3/4's hooks cannot force invocation — see Global Constraints).

- [ ] **Step 1: Start a fresh RestoreAssist Claude Code session and do one trivial, verifiable action**

In a new terminal:
```bash
cd /Users/phillmcgurk/RestoreAssist
claude
```
Inside the session, ask Claude to do something small and checkable, e.g.: "Read package.json and tell me the `name` and `version` fields." Confirm it answers correctly (cross-check against `cat package.json | head -5` in a separate terminal).

- [ ] **Step 2: End the session and observe the Stop hook nudge**

Type `exit` or press the session's stop key. Before the session fully exits, the transcript should show the injected `additionalContext` from `stop-handoff-nudge.sh` (the "Before this session ends, consider running /session-handoff..." text) alongside whatever `stop-verifier.sh` outputs (empty, if the session made no domain-matching edits). If the harness surfaces `additionalContext` only when the session continues rather than truly exits, re-run Step 1's ask but end with an explicit instruction: "Now run /session-handoff before you stop." — this directly exercises the skill regardless of whether the passive nudge alone was enough to trigger it (documenting the honest gap from Global Constraints: the hook nudges, it does not compel).

- [ ] **Step 3: Confirm the handoff file was written**

```bash
ls -la /Users/phillmcgurk/RestoreAssist/docs/session-handoffs/
```

Expected: at least one `handoff-<ts>.md` file with a `mtime` matching the session just ended. If `scripts/handoff-loop.sh` doesn't exist (confirmed absent earlier in this repo), the handoff's Phase 0 gate reports **BLOCKED** per `session-handoff/SKILL.md`'s own contract ("Non-zero → write a BLOCKED handoff naming the failing gate") — a BLOCKED handoff is still a valid file for this test; the goal is confirming the write path works, not that the gate passes.

```bash
cat /Users/phillmcgurk/RestoreAssist/docs/session-handoffs/handoff-*.md | tail -30
```

Expected: the file contains the 10-section structure from `session-handoff/SKILL.md` ("Required output" list: Summary, Where it started, Decisions locked, Key files, Running state, Verification, Deferred/open questions, Pick up here, Risk notes, Handoff quality check), ending with a line starting `Handoff complete. Next safe action:`.

- [ ] **Step 4: Start a second fresh session and observe the SessionStart hook nudge**

```bash
cd /Users/phillmcgurk/RestoreAssist
claude
```

Expected: the session's initial context includes the injected text from `session-start-resume-nudge.sh` ("A prior session handoff exists at docs/session-handoffs/handoff-<ts>.md. Consider running /resume-from-handoff...") plus, if this happened to be a `--continue`/`--resume` invocation, the `compact`-matcher hook's output only fires on actual compaction (not on plain startup) — confirm by checking the transcript does NOT show "== Post-Compaction Context ==" on a fresh `claude` startup, only the resume-nudge text.

- [ ] **Step 5: Confirm resume-from-handoff picks up the handoff**

Inside the new session, explicitly run: `/resume-from-handoff`

Expected per `resume-from-handoff/SKILL.md`'s Phase 1–3 contract:
1. Phase 1 parses the handoff written in Step 3.
2. Phase 2 runs `git branch --show-current`, `git status --short`, `git log --oneline -n 12`, `git diff --stat` and (if `scripts/handoff-loop.sh` exists by this point) re-runs the gate; since it doesn't exist in this repo yet, expect the skill to report that check as skipped/not-applicable rather than silently pretending it passed.
3. Phase 3 emits a **Resume Reconciliation** with a verdict — expect **MATCH** or **MINOR DRIFT** (session 1 made no code changes in this trivial test, so there should be nothing to drift).
4. The session ends its response with `Resume complete (or paused). Next safe action: <one sentence>.`

- [ ] **Step 6: Clean up the test handoff (optional, only if the operator wants a clean docs tree)**

```bash
cd /Users/phillmcgurk/RestoreAssist
git status --short docs/session-handoffs/
```

If the file is untracked and was purely for this test, either commit it (it's a legitimate durable record — `session-handoff`'s own design intent) or remove it:
```bash
rm /Users/phillmcgurk/RestoreAssist/docs/session-handoffs/handoff-*.md
rmdir /Users/phillmcgurk/RestoreAssist/docs/session-handoffs 2>/dev/null || true
```
Decide based on whether the trivial test task itself is worth a permanent record — for a pure smoke test, removal is reasonable; do not remove if any real repo change happened during Step 1.

---

## Self-Review

**1. Spec coverage.**
- Task 1 (Nexus procedure hooks): covered — exact markdown for both edits, matching existing tone (imperative numbered steps + completion-criterion sub-bullets, same as the original), verified against the 200-line cap, full branch/commit/push/PR sequence against Pi-Dev-Ops's real branch protection.
- Task 2 (un-gating decision): covered — traced `automation: manual` against the actual schema file rather than assuming; concluded no frontmatter change needed and explained why the model-auto-trigger gate (`disable-model-invocation`) is a different mechanism than Nexus's directed procedural call. This is the "hard connector to Nexus specifically" requirement — Task 1's step 2/6 additions are what make the connection real, not a standalone hook.
- Task 3 (Stop hook): covered — new script + exact JSON diff, additive to `stop-verifier.sh`, tested standalone before wiring, honest about the "nudge not force" mechanic discovered via verification.
- Task 4 (SessionStart hook): covered — verified the Plaud hook is global-only (not a local conflict) before writing the diff, exact JSON diff additive to the existing `compact` entry, standalone test.
- Task 5 (E2E verification): covered — concrete commands and expected output at each of the 6 steps, not "verify it works"; explicitly handles the missing `scripts/handoff-loop.sh`/`docs/session-handoffs/` gap discovered during research rather than assuming they exist.

**2. Placeholder scan.** No "TBD"/"implement later"/"add appropriate error handling" found in any task. Every script in Tasks 3–4 is complete, runnable bash with real logic (not stubs). Task 1's markdown blocks are the literal, complete replacement text, not summaries.

**3. Type/name consistency.** `stop-handoff-nudge.sh` and `session-start-resume-nudge.sh` are named consistently between the Files sections, the Write steps, the settings.local.json diffs, and the commit messages. Nexus's new step numbers (2 for the handoff-load check, 6 for the handoff-write) are referenced identically in Task 1's own steps and in Task 2's Step 3 discussion — no renumbering drift.

**Assumptions flagged (where prompt framing and actual findings differed):**
- The prompt assumed a hook could plausibly "fire `/session-handoff`" outright. Verified via the claude-code-guide agent this session: **it cannot** — hooks only block/inject text; the running Claude session must autonomously choose to invoke the skill. Tasks 3–4 are written to that real contract (nudge, not force), and Task 5 documents the fallback of explicitly typing the slash command if the passive nudge doesn't trigger it.
- The prompt's Task 5 assumed `docs/session-handoffs/` and the resume flow "just work." Verified this session that **`scripts/handoff-loop.sh` does not exist in RestoreAssist** — `session-handoff`'s Phase 0 gate will report BLOCKED rather than run a real gate. This is not fixed by this plan (out of scope: fixing session-handoff's dependency is a separate task, not a "hard connector" task), but every relevant step (Task 3 Step 2's `GATE_NOTE`, Task 5 Step 3) says so explicitly rather than silently assuming success.
- `.claude/settings.local.json` vs `.claude/settings.json` for the new hooks: decided via this repo's own commit history (`455bb64d` edited hook blocks in `settings.local.json`), not guessed.
