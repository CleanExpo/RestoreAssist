# Self-Improving Skills (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give skills a propose-via-PR self-improvement loop — when `agent-expert`'s Act-Learn-Reuse lessons repeatedly flag the same skill's own process as broken, automatically draft a scoped `SKILL.md` diff, gate it through `skill-authoring-standard`'s review checklist, and open a labelled PR against Pi-Dev-Ops for a human to merge. Never self-merges, never edits a `SKILL.md` on disk outside a PR branch.

**Architecture:** Four composable pieces, each independently testable: (1) a one-field schema addition to `.harness/lessons.jsonl` (`applies_to_skill`) written by whatever already writes lessons — no new lesson-writer code exists to modify, since `agent-expert`'s mechanism today is a documented procedure, not a script (see Task 1 note); (2) a new Python threshold-scan script, `scripts/scan_skill_lessons.py`, modelled directly on the existing `scripts/analyse_lessons.py` (same repo, same clustering/lock-file/cooldown idioms) but filtering on `applies_to_skill` instead of `category`; (3) an LLM-dispatch step that drafts one scoped diff per flagged skill, using the exact prompt text defined in Task 3; (4) a checklist-gate script that runs the real `skill-authoring-standard` checklist items programmatically where mechanical (line count, banned frontmatter fields, `SKILL.md` existence) and defers to the dispatched LLM's own self-check for the qualitative items (duplication, leading-word steering, sediment) as instructed in the same prompt — and a PR-opening step scoped to the Pi-Dev-Ops repo specifically (the existing `pr-creator` subagent is RestoreAssist-local and cannot be reused as-is; see Task 5 note).

**Tech Stack:** Python 3 (matches `scripts/analyse_lessons.py` and the rest of `Pi-Dev-Ops/scripts/`), `pytest` for tests (matches `Pi-Dev-Ops/tests/`), `gh` CLI for label/PR creation, no new third-party dependencies.

## Global Constraints

- This never self-merges and never edits a `SKILL.md` file directly on disk outside of a PR branch (design §6, hard constraint, non-negotiable).
- The diff to a flagged skill's `SKILL.md` is single, scoped, one section, append-only preferred — never a full rewrite (design §6 point 3).
- The diff must pass `skill-authoring-standard`'s `references/review-checklist.md` gate before a human ever sees it (design §6 point 4).
- PR title convention: `skill-learn(<skill-name>): <one-line lesson>` (design §6 point 5).
- PR label: `skill-self-update` (design §6 point 5) — confirmed via `gh label list --repo CleanExpo/Pi-Dev-Ops` that this label does not exist yet, so creating it is a first-class step here, not an assumption.
- PR opens against Pi-Dev-Ops (confirmed: `~/.claude/skills/agent-expert`, `~/.claude/skills/analyzing-customer-patterns`, and `~/.claude/skills/skill-authoring-standard` are all real symlinks to `/Users/phillmcgurk/Pi-Dev-Ops/skills/<name>` — Pi-Dev-Ops is the canonical skill home), on a new feature branch, never directly to `main` (confirmed via `gh api repos/CleanExpo/Pi-Dev-Ops/branches/main/protection`: three required status checks — `Python (pytest + ruff)`, `Frontend (tsc + eslint + build)`, `Pi CEO API smoke test (28 checks)` — direct pushes to `main` are blocked).
- No fabricated schema/thresholds: the `applies_to_skill` field, the threshold default, and the checklist items in this plan are all taken verbatim from the real files read during research (cited inline per task), not invented.

---

## File Structure

| File | Responsibility |
|---|---|
| `Pi-Dev-Ops/.harness/lessons.jsonl` | Existing append-only lesson log. Gets one new optional field on relevant entries: `applies_to_skill`. No structural change. |
| `Pi-Dev-Ops/skills/agent-expert/SKILL.md` | Existing 14-line procedure doc. Gets one new paragraph documenting when to set `applies_to_skill`. |
| `Pi-Dev-Ops/scripts/scan_skill_lessons.py` | New. Reads `lessons.jsonl`, filters `applies_to_skill` entries, groups by skill name, flags skills over threshold. Mirrors `analyse_lessons.py`'s clustering/lock-file idiom. |
| `Pi-Dev-Ops/tests/test_scan_skill_lessons.py` | New. TDD coverage for the threshold-scan job against a synthetic fixture. |
| `Pi-Dev-Ops/scripts/draft_skill_diff.py` | New. Given a flagged skill + its grouped lessons, builds the LLM dispatch prompt (Task 3's exact text) and writes the drafted diff to `.harness/skill-self-update-drafts/<skill-name>-<date>.diff` for the next stage to consume. |
| `Pi-Dev-Ops/tests/test_draft_skill_diff.py` | New. Tests prompt construction and draft-file writing (not the LLM call itself, which is mocked). |
| `Pi-Dev-Ops/scripts/review_skill_diff.py` | New. Runs the mechanical subset of `skill-authoring-standard`'s review checklist against a drafted diff; pass/fail with reasons. |
| `Pi-Dev-Ops/tests/test_review_skill_diff.py` | New. TDD coverage for pass/fail logic against synthetic diffs (one that passes, one that fails on line-count, one that fails on duplication). |
| `Pi-Dev-Ops/scripts/open_skill_pr.py` | New. On checklist pass, creates the `skill-self-update` label if missing, creates a feature branch, applies the diff, commits, pushes, and opens the PR via `gh pr create` against Pi-Dev-Ops `main`. |
| `Pi-Dev-Ops/tests/test_open_skill_pr.py` | New. Tests branch/PR-title/label construction logic with `gh` calls mocked via `monkeypatch`. |
| `Pi-Dev-Ops/scripts/skill_self_update.py` | New. Orchestrator — chains scan → draft → review → open-PR. This is what a session (or a future scheduled task) actually invokes. |
| `Pi-Dev-Ops/tests/test_skill_self_update.py` | New. End-to-end test of the orchestrator against a synthetic `lessons.jsonl`, with the LLM-dispatch and `gh` calls mocked. |

---

### Task 1: Add `applies_to_skill` field to the lessons schema

**Files:**
- Modify: `Pi-Dev-Ops/skills/agent-expert/SKILL.md`
- Test: none (this task edits a procedure document, not code — no test framework applies to a markdown instruction file; verification is a manual read-through in Step 3)

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: the `applies_to_skill` field name and semantics that Task 2's scanner filters on (`entry.get("applies_to_skill")`, a string equal to a skill's folder name, e.g. `"agent-expert"`) and that Task 1's own example JSON line documents as the literal shape any lesson-writer should follow.

**Context — read this before editing.** `agent-expert`'s current mechanism is **not** a script. The entire `SKILL.md` is 14 lines:

```markdown
---
name: agent-expert
description: Act-Learn-Reuse cycle for agent improvement over time.
---

# Agent Experts

## The Cycle
1. ACT - Execute the task
2. LEARN - Extract lessons (patterns, pitfalls, context, tools, conventions)
3. REUSE - Inject relevant lessons into next task

Store lessons in .harness/lessons.jsonl. Inject top 5 most relevant per task.
```

There is no `write_lesson()` function or lesson-writer script anywhere in the codebase that this SKILL.md points to — "Store lessons in .harness/lessons.jsonl" is an instruction to whichever agent is running the LEARN step to append a JSON line itself, by hand, following the shape already established by existing entries (confirmed from `Pi-Dev-Ops/.harness/lessons.jsonl`, 49 real lines, e.g.:

```json
{"ts": "2026-04-07T00:00:02Z", "source": "architecture-review", "category": "security", "lesson": "Always sanitise session IDs before using them in file paths. re.sub(r'[^a-zA-Z0-9]', '', sid) prevents path traversal attacks (e.g. sid='../../etc/passwd').", "severity": "warn"}
```

Current schema fields, confirmed from real data: `ts` (ISO-8601 string), `source` (string, e.g. `"architecture-review"`), `category` (string, free-text bucket like `"security"`, `"persistence"`, `"claude"`), `lesson` (string, the plain-English lesson), `severity` (`"info"` | `"warn"` | `"error"`).

Because there is no script to modify, this task's deliverable is a documentation change to `agent-expert/SKILL.md` that (a) adds the new optional field to the documented shape, and (b) tells the LEARN step exactly when to set it: when the lesson is about the skill's own process or instructions (a `SKILL.md` is unclear, missing a step, contradicts itself, or its guidance caused the mistake) rather than about the task's domain content (a bug in application code, an infra misconfiguration, a business-logic error).

- [ ] **Step 1: Edit `agent-expert/SKILL.md` to document the new field**

Modify `/Users/phillmcgurk/Pi-Dev-Ops/skills/agent-expert/SKILL.md` from:

```markdown
---
name: agent-expert
description: Act-Learn-Reuse cycle for agent improvement over time.
---

# Agent Experts

## The Cycle
1. ACT - Execute the task
2. LEARN - Extract lessons (patterns, pitfalls, context, tools, conventions)
3. REUSE - Inject relevant lessons into next task

Store lessons in .harness/lessons.jsonl. Inject top 5 most relevant per task.
```

to:

```markdown
---
name: agent-expert
description: Act-Learn-Reuse cycle for agent improvement over time.
---

# Agent Experts

## The Cycle
1. ACT - Execute the task
2. LEARN - Extract lessons (patterns, pitfalls, context, tools, conventions)
3. REUSE - Inject relevant lessons into next task

Store lessons in .harness/lessons.jsonl. Inject top 5 most relevant per task.

## Skill-process lessons

If the lesson is about a **skill's own process or instructions** — its `SKILL.md`
was unclear, missing a step, contradicted itself, or its guidance is what caused
the mistake — rather than about the task's domain content, add one extra field:
`applies_to_skill`, set to that skill's exact folder name under `skills/` (e.g.
`"agent-expert"`, `"skill-authoring-standard"`). Omit this field entirely for
ordinary domain lessons (a code bug, an infra misconfiguration, a business-logic
error) — it is optional and skill-scoped lessons are the minority case.

Example — a domain lesson (no `applies_to_skill`):

```json
{"ts": "2026-07-03T02:00:00Z", "source": "architecture-review", "category": "security", "lesson": "Webhook signature verification must use hmac.compare_digest, not ==.", "severity": "warn"}
```

Example — a skill-process lesson (`applies_to_skill` set):

```json
{"ts": "2026-07-03T02:00:00Z", "source": "linear-task-processor", "category": "process", "applies_to_skill": "skill-authoring-standard", "lesson": "The review-checklist.md line-count cap (200 lines) doesn't say whether YAML frontmatter counts toward the limit — two agents interpreted this differently in the same week. Clarify in the checklist itself.", "severity": "warn"}
```

`scripts/scan_skill_lessons.py` reads this field to detect when a skill's own
instructions need a fix — see that script for the threshold and PR flow.
```

- [ ] **Step 2: Verify the edit renders correctly**

Run: `cat /Users/phillmcgurk/Pi-Dev-Ops/skills/agent-expert/SKILL.md`
Expected: the file shows the new "## Skill-process lessons" section appended after the existing content, with both example JSON blocks present and syntactically valid JSON (spot-check by eye — this is a doc file, not code).

- [ ] **Step 3: Validate the two example JSON lines parse**

Run:
```bash
python3 -c "
import json
domain = '{\"ts\": \"2026-07-03T02:00:00Z\", \"source\": \"architecture-review\", \"category\": \"security\", \"lesson\": \"Webhook signature verification must use hmac.compare_digest, not ==.\", \"severity\": \"warn\"}'
skill = '{\"ts\": \"2026-07-03T02:00:00Z\", \"source\": \"linear-task-processor\", \"category\": \"process\", \"applies_to_skill\": \"skill-authoring-standard\", \"lesson\": \"The review-checklist.md line-count cap (200 lines) doesnt say whether YAML frontmatter counts toward the limit.\", \"severity\": \"warn\"}'
json.loads(domain)
json.loads(skill)
print('both parse OK')
"
```
Expected: `both parse OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git checkout -b skill-self-update/applies-to-skill-field
git add skills/agent-expert/SKILL.md
git commit -m "docs(agent-expert): add optional applies_to_skill lesson field"
```

---

### Task 2: Build the threshold-scan job

**Files:**
- Create: `Pi-Dev-Ops/scripts/scan_skill_lessons.py`
- Create: `Pi-Dev-Ops/tests/test_scan_skill_lessons.py`

**Interfaces:**
- Consumes: the `applies_to_skill` field documented in Task 1, and the existing `lessons.jsonl` shape (`ts`, `source`, `category`, `lesson`, `severity`).
- Produces: `load_skill_lessons(path: Path) -> list[dict]`, `group_by_skill(lessons: list[dict]) -> dict[str, list[dict]]`, `find_flagged_skills(groups: dict[str, list[dict]], min_count: int = 3, window_days: int = 30) -> dict[str, list[dict]]` — a function later tasks call to get the flagged-skill → lesson-list mapping. `min_count` and `window_days` are the exact parameter names Task 4's orchestrator will pass through.

**Threshold rationale — read before writing code.** The design spec (§6 point 2) says to mirror `analyzing-customer-patterns`' pattern-object shape, and to use a frequency/severity threshold "consistent with analyzing-customer-patterns' actual existing threshold conventions if it has one." Two real, adjacent conventions exist in this codebase and neither is a plain frequency-only count:

1. `analyzing-customer-patterns`' own `feedback_loop.py` mechanism uses a **30-day staleness window** (`days_since_ship`) as its time boundary, and its pattern object carries a `frequency` field with no fixed numeric cutoff documented in the SKILL.md itself (the worked example shows `"frequency": 3` for a `"high"` severity pattern, but this is an example, not a stated constant).
2. The sibling script `scripts/analyse_lessons.py` (the actual threshold-scan job that already exists for domain lessons, clustering by `category` instead of `applies_to_skill`) uses `min_count=2` as its default, argparse-overridable via `--min-count`.

This plan sets the default to **`min_count=3` within a `window_days=30`** window — one higher than `analyse_lessons.py`'s `min_count=2` because a skill-instruction rewrite is a more disruptive, harder-to-reverse action than a Linear ticket (which is what `analyse_lessons.py`'s `min_count=2` gates), and 30 days matches `analyzing-customer-patterns`' own staleness window exactly rather than inventing a new one. Both are named constants, both are argparse-overridable, matching the existing script's own pattern.

- [ ] **Step 1: Write the failing tests**

Create `/Users/phillmcgurk/Pi-Dev-Ops/tests/test_scan_skill_lessons.py`:

```python
"""tests/test_scan_skill_lessons.py — threshold-scan job for skill-process lessons."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from scripts.scan_skill_lessons import (  # noqa: E402
    find_flagged_skills,
    group_by_skill,
    load_skill_lessons,
)


def _entry(skill: str, days_ago: int, severity: str = "warn", lesson: str = "x") -> dict:
    ts = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    return {
        "ts": ts,
        "source": "test",
        "category": "process",
        "applies_to_skill": skill,
        "lesson": lesson,
        "severity": severity,
    }


def _write_jsonl(path: Path, entries: list[dict]) -> None:
    with path.open("w") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")


def test_load_skill_lessons_filters_out_entries_without_applies_to_skill(tmp_path):
    path = tmp_path / "lessons.jsonl"
    _write_jsonl(path, [
        {"ts": "2026-07-01T00:00:00Z", "source": "x", "category": "security", "lesson": "domain lesson", "severity": "warn"},
        _entry("agent-expert", days_ago=1),
    ])
    result = load_skill_lessons(path)
    assert len(result) == 1
    assert result[0]["applies_to_skill"] == "agent-expert"


def test_load_skill_lessons_missing_file_returns_empty(tmp_path):
    result = load_skill_lessons(tmp_path / "does-not-exist.jsonl")
    assert result == []


def test_load_skill_lessons_skips_malformed_json_lines(tmp_path):
    path = tmp_path / "lessons.jsonl"
    path.write_text('{"applies_to_skill": "agent-expert", "ts": "2026-07-01T00:00:00Z"}\nnot json\n')
    result = load_skill_lessons(path)
    assert len(result) == 1


def test_group_by_skill_groups_correctly():
    lessons = [
        _entry("agent-expert", days_ago=1),
        _entry("agent-expert", days_ago=2),
        _entry("skill-authoring-standard", days_ago=1),
    ]
    groups = group_by_skill(lessons)
    assert set(groups.keys()) == {"agent-expert", "skill-authoring-standard"}
    assert len(groups["agent-expert"]) == 2
    assert len(groups["skill-authoring-standard"]) == 1


def test_find_flagged_skills_respects_min_count_default_3():
    groups = {
        "agent-expert": [_entry("agent-expert", days_ago=1) for _ in range(3)],
        "boardroom": [_entry("boardroom", days_ago=1) for _ in range(2)],
    }
    flagged = find_flagged_skills(groups)
    assert "agent-expert" in flagged
    assert "boardroom" not in flagged


def test_find_flagged_skills_excludes_entries_outside_window_days_30():
    old_entries = [_entry("agent-expert", days_ago=45) for _ in range(5)]
    groups = {"agent-expert": old_entries}
    flagged = find_flagged_skills(groups, min_count=3, window_days=30)
    assert "agent-expert" not in flagged


def test_find_flagged_skills_mixed_window_counts_only_recent():
    entries = (
        [_entry("agent-expert", days_ago=45) for _ in range(5)]
        + [_entry("agent-expert", days_ago=1) for _ in range(2)]
    )
    groups = {"agent-expert": entries}
    flagged = find_flagged_skills(groups, min_count=3, window_days=30)
    assert "agent-expert" not in flagged  # only 2 within window, threshold is 3


def test_find_flagged_skills_custom_min_count_override():
    groups = {"agent-expert": [_entry("agent-expert", days_ago=1) for _ in range(2)]}
    flagged = find_flagged_skills(groups, min_count=2, window_days=30)
    assert "agent-expert" in flagged
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_scan_skill_lessons.py -v`
Expected: `ModuleNotFoundError: No module named 'scripts.scan_skill_lessons'` (or collection error) for all tests — `scan_skill_lessons.py` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `/Users/phillmcgurk/Pi-Dev-Ops/scripts/scan_skill_lessons.py`:

```python
"""
scan_skill_lessons.py — Threshold-scan job for skill-process self-improvement (RA-continuous-moa §6.2)

Reads .harness/lessons.jsonl, filters entries carrying `applies_to_skill`,
groups by skill name, and flags any skill whose grouped entries within the
last `window_days` days reach `min_count`. Mirrors scripts/analyse_lessons.py's
load/cluster/threshold shape, applied to skill-process lessons instead of
domain-category lessons.

Usage:
    python scripts/scan_skill_lessons.py [--min-count N] [--window-days N] [--dry-run]

Not scheduled by this script — the orchestrator (scripts/skill_self_update.py)
calls find_flagged_skills() directly within a session-bound loop, per the
design's "no standing cron" constraint (design spec §2, §3).
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("pi-ceo.scan-skill-lessons")

_HARNESS = _ROOT / ".harness"
_LESSONS_FILE = _HARNESS / "lessons.jsonl"

_DEFAULT_MIN_COUNT = 3
_DEFAULT_WINDOW_DAYS = 30


def load_skill_lessons(path: Path) -> list[dict]:
    """Load lessons.jsonl entries that carry a non-empty `applies_to_skill` field."""
    lessons: list[dict] = []
    if not path.exists():
        log.warning("lessons.jsonl not found at %s", path)
        return lessons
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("applies_to_skill"):
                lessons.append(entry)
    log.info("Loaded %d skill-process lessons", len(lessons))
    return lessons


def group_by_skill(lessons: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for entry in lessons:
        groups[entry["applies_to_skill"]].append(entry)
    return dict(groups)


def _within_window(entry: dict, window_days: int) -> bool:
    ts_raw = entry.get("ts", "")
    try:
        ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    return ts >= cutoff


def find_flagged_skills(
    groups: dict[str, list[dict]],
    min_count: int = _DEFAULT_MIN_COUNT,
    window_days: int = _DEFAULT_WINDOW_DAYS,
) -> dict[str, list[dict]]:
    """Return {skill_name: [entries]} for every skill whose entries within
    `window_days` reach `min_count`. Only the in-window entries are returned.
    """
    flagged: dict[str, list[dict]] = {}
    for skill, entries in groups.items():
        recent = [e for e in entries if _within_window(e, window_days)]
        if len(recent) >= min_count:
            flagged[skill] = recent
    return flagged


def main() -> None:
    parser = argparse.ArgumentParser(description="Skill-process lesson threshold scan")
    parser.add_argument("--min-count", type=int, default=_DEFAULT_MIN_COUNT)
    parser.add_argument("--window-days", type=int, default=_DEFAULT_WINDOW_DAYS)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    lessons = load_skill_lessons(_LESSONS_FILE)
    groups = group_by_skill(lessons)
    flagged = find_flagged_skills(groups, min_count=args.min_count, window_days=args.window_days)

    if not flagged:
        log.info("No skills flagged (min_count=%d, window_days=%d)", args.min_count, args.window_days)
        sys.exit(0)

    for skill, entries in flagged.items():
        log.info("FLAGGED: %s — %d lessons in last %d days", skill, len(entries), args.window_days)

    if args.dry_run:
        log.info("[DRY RUN] Would hand off %d flagged skill(s) to draft_skill_diff.py", len(flagged))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_scan_skill_lessons.py -v`
Expected: `8 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git add scripts/scan_skill_lessons.py tests/test_scan_skill_lessons.py
git commit -m "feat(skill-self-update): add threshold-scan job for skill-process lessons"
```

---

### Task 3: Build the scoped-diff drafter

**Files:**
- Create: `Pi-Dev-Ops/scripts/draft_skill_diff.py`
- Create: `Pi-Dev-Ops/tests/test_draft_skill_diff.py`

**Interfaces:**
- Consumes: `find_flagged_skills()`'s return shape from Task 2 — `dict[str, list[dict]]`, each inner dict having `lesson`, `severity`, `source`, `ts` at minimum.
- Produces: `build_dispatch_prompt(skill_name: str, skill_md_path: Path, lessons: list[dict]) -> str` (the literal prompt text sent to the LLM dispatch — Task 4 and the orchestrator in Task 6 both call this), and `write_draft(skill_name: str, diff_text: str, output_dir: Path = _DRAFTS_DIR) -> Path` (writes the drafted diff to disk and returns its path — Task 4's reviewer reads from this path).

**Why this is an LLM-dispatch step, not deterministic code.** Drafting a coherent, scoped, standard-compliant `SKILL.md` edit from free-text lesson strings requires judgment a diff algorithm cannot supply — deciding which existing section the new guidance belongs under, phrasing it as a "leading word" per `skill-authoring-standard`'s Steering gate, and keeping it append-only rather than restructuring. This step therefore builds a complete, concrete prompt and hands it to the `Agent` tool (`subagent_type: general-purpose`, since no drafting-specific agent exists) — it does not attempt to synthesize the diff with string templates.

- [ ] **Step 1: Write the failing tests**

Create `/Users/phillmcgurk/Pi-Dev-Ops/tests/test_draft_skill_diff.py`:

```python
"""tests/test_draft_skill_diff.py — scoped-diff drafter prompt + draft-file writer."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from scripts.draft_skill_diff import build_dispatch_prompt, write_draft  # noqa: E402


def _lessons():
    return [
        {
            "ts": "2026-07-01T00:00:00Z",
            "source": "linear-task-processor",
            "applies_to_skill": "skill-authoring-standard",
            "lesson": "The line-count cap doesn't say whether frontmatter counts.",
            "severity": "warn",
        },
        {
            "ts": "2026-07-02T00:00:00Z",
            "source": "pr-manager",
            "applies_to_skill": "skill-authoring-standard",
            "lesson": "Two reviewers disagreed on whether frontmatter counts toward the 200-line cap.",
            "severity": "warn",
        },
        {
            "ts": "2026-07-03T00:00:00Z",
            "source": "orchestrator-reviewer",
            "applies_to_skill": "skill-authoring-standard",
            "lesson": "Same frontmatter/line-count ambiguity caused a third round-trip.",
            "severity": "error",
        },
    ]


def test_build_dispatch_prompt_includes_skill_name_and_path(tmp_path):
    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text("# skill-authoring-standard\n\ncontent\n")
    prompt = build_dispatch_prompt("skill-authoring-standard", skill_md, _lessons())
    assert "skill-authoring-standard" in prompt
    assert str(skill_md) in prompt


def test_build_dispatch_prompt_includes_all_lesson_text(tmp_path):
    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text("# skill-authoring-standard\n\ncontent\n")
    prompt = build_dispatch_prompt("skill-authoring-standard", skill_md, _lessons())
    for lesson in _lessons():
        assert lesson["lesson"] in prompt


def test_build_dispatch_prompt_states_append_only_constraint(tmp_path):
    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text("# skill-authoring-standard\n\ncontent\n")
    prompt = build_dispatch_prompt("skill-authoring-standard", skill_md, _lessons())
    assert "append-only" in prompt.lower() or "single, scoped" in prompt.lower()


def test_write_draft_creates_file_with_diff_content(tmp_path):
    diff_text = "--- a/SKILL.md\n+++ b/SKILL.md\n@@ -1,1 +1,2 @@\n # skill\n+new line\n"
    out_dir = tmp_path / "drafts"
    path = write_draft("skill-authoring-standard", diff_text, output_dir=out_dir)
    assert path.exists()
    assert path.read_text() == diff_text
    assert path.parent == out_dir


def test_write_draft_filename_includes_skill_name(tmp_path):
    path = write_draft("agent-expert", "diff content", output_dir=tmp_path)
    assert "agent-expert" in path.name
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_draft_skill_diff.py -v`
Expected: `ModuleNotFoundError: No module named 'scripts.draft_skill_diff'`

- [ ] **Step 3: Write the minimal implementation**

Create `/Users/phillmcgurk/Pi-Dev-Ops/scripts/draft_skill_diff.py`:

```python
"""
draft_skill_diff.py — Scoped-diff drafter for skill self-improvement (RA-continuous-moa §6.3)

Given a flagged skill name + its grouped lessons (from scan_skill_lessons.py),
builds the exact dispatch prompt for an LLM agent to draft a single, scoped,
append-only diff to that skill's SKILL.md, and writes the resulting diff to
.harness/skill-self-update-drafts/.

This module does NOT call the LLM itself — build_dispatch_prompt() returns the
prompt text; the orchestrator (skill_self_update.py) hands it to the Agent tool
(subagent_type: general-purpose) and passes the returned diff text to write_draft().
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

_DRAFTS_DIR = _ROOT / ".harness" / "skill-self-update-drafts"

DISPATCH_PROMPT_TEMPLATE = """You are drafting a single, scoped patch to an existing Claude Code skill file because the skill's own process or instructions have been flagged as a recurring source of confusion.

Skill name: {skill_name}
Skill file (read this in full before drafting anything): {skill_md_path}

The following {lesson_count} lessons were logged against this skill's process within the last 30 days (each is a real mistake or point of confusion an agent hit while following this skill's instructions):

{lesson_block}

Your task:
1. Read the skill file at {skill_md_path} in full.
2. Identify the ONE existing section most relevant to these lessons (e.g. an existing gate, rule list, or step). Do not invent a new top-level section unless no existing section fits.
3. Draft a single, scoped, append-only change — typically one new bullet or one clarifying sentence added to that existing section. Do NOT rewrite, reorder, or delete any existing content. Do NOT touch YAML frontmatter unless a lesson is specifically about frontmatter being wrong.
4. Keep the addition as short as the lessons justify — usually 1-3 lines. This skill file is governed by skill-authoring-standard's review checklist, which caps SKILL.md at 200 lines total and penalises duplication, so do not restate content that already exists elsewhere in the file.
5. Output ONLY a unified diff (git diff format, `--- a/{skill_md_relpath}` / `+++ b/{skill_md_relpath}` headers, `@@` hunk markers) that applies cleanly with `git apply`. No prose before or after the diff. No markdown code fences around the diff.

If, after reading the file, you determine the lessons do not justify any change (e.g. the file already covers this, or the lessons are too vague to act on), output exactly the line `NO_CHANGE_JUSTIFIED` and nothing else — do not force a diff.
"""


def build_dispatch_prompt(skill_name: str, skill_md_path: Path, lessons: list[dict]) -> str:
    lesson_lines = []
    for entry in lessons:
        severity = entry.get("severity", "info")
        source = entry.get("source", "unknown")
        ts = entry.get("ts", "unknown")
        text = entry.get("lesson", "")
        lesson_lines.append(f"- [{severity}, from {source}, {ts}] {text}")
    lesson_block = "\n".join(lesson_lines)

    try:
        skill_md_relpath = skill_md_path.relative_to(_ROOT).as_posix()
    except ValueError:
        skill_md_relpath = skill_md_path.as_posix()

    return DISPATCH_PROMPT_TEMPLATE.format(
        skill_name=skill_name,
        skill_md_path=str(skill_md_path),
        skill_md_relpath=skill_md_relpath,
        lesson_count=len(lessons),
        lesson_block=lesson_block,
    )


def write_draft(skill_name: str, diff_text: str, output_dir: Path = _DRAFTS_DIR) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    path = output_dir / f"{skill_name}-{date_str}.diff"
    path.write_text(diff_text)
    return path
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_draft_skill_diff.py -v`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git add scripts/draft_skill_diff.py tests/test_draft_skill_diff.py
git commit -m "feat(skill-self-update): add scoped-diff drafter with LLM dispatch prompt"
```

---

### Task 4: Wire the skill-authoring-standard review gate

**Files:**
- Create: `Pi-Dev-Ops/scripts/review_skill_diff.py`
- Create: `Pi-Dev-Ops/tests/test_review_skill_diff.py`

**Interfaces:**
- Consumes: a diff-text string (what `write_draft()` from Task 3 wrote to disk) and the target `skill_md_path` it applies to.
- Produces: `review_diff(diff_text: str, skill_md_path: Path) -> ReviewResult`, where `ReviewResult` is a `dataclass` with fields `passed: bool`, `failures: list[str]` — Task 5's PR-opener checks `result.passed` before proceeding, and Task 6's orchestrator logs `result.failures` on reject.

**Which checklist items are mechanically checkable here, verbatim from `skill-authoring-standard/references/review-checklist.md`:**

- "`SKILL.md` ≤ 200 lines. Over → it is Sprawl; disclose reference out." — mechanically countable: apply the diff to a copy of the file, count lines.
- "No banned fields (`version`, `owner_role`, `status`, `metadata.requires`) without a stated reason." — mechanically checkable: the diff must not touch YAML frontmatter, or if it does, must not introduce these keys.
- "External reference lives only in `references/`... FAIL on: session-scoped symlinks, committed venvs, nested plugin repos, backup dirs in the live skill folder." — mechanically checkable as "diff touches only the one target `SKILL.md`, no other files."
- "Single source of truth: no reference/template/trigger duplicated across files or steps (Duplication)." — this one and the Steering/Pruning gates (leading-word check, sediment, no-ops) are qualitative and require reading the *meaning* of the text, not just counting lines — these cannot be mechanically verified by a script with confidence. Per the design's "no placeholders" requirement, this plan does not pretend otherwise: Task 3's dispatch prompt already instructs the drafting agent to self-apply these qualitative gates (step 4 of the prompt references duplication and the 200-line cap explicitly), and this script only re-checks the two items that are unambiguously mechanical (line count, frontmatter, file scope). A human reviewing the resulting PR is the final gate for the qualitative items — consistent with design §6's "propose-via-PR only" framing: the automation's job is to reject the obviously bloated or off-target diff before a human's time is spent, not to fully replace human review.

**Pass/fail policy — discard-and-log, no retry.** On FAIL, this script logs the failure and the orchestrator (Task 6) discards the draft — it does not retry with feedback. Justification against the spec's "reject bloated/off-standard proposals automatically" requirement (design §6 point 4): a retry loop risks the LLM re-drafting into the same failure mode repeatedly (e.g. it keeps producing a >200-line rewrite because it's fundamentally treating this as a rewrite task, not an append), burning tokens on a skill file that a human will review anyway once a future lesson cluster re-triggers the scan. Discard-and-log keeps the automation's failure mode cheap and legible: the flagged skill simply isn't proposed this cycle, the lessons remain in `lessons.jsonl` for the next scan, and a human can look at `.harness/skill-self-update-drafts/` REJECTED entries if they want to see what was attempted.

- [ ] **Step 1: Write the failing tests**

Create `/Users/phillmcgurk/Pi-Dev-Ops/tests/test_review_skill_diff.py`:

```python
"""tests/test_review_skill_diff.py — mechanical subset of skill-authoring-standard's review-checklist."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from scripts.review_skill_diff import review_diff  # noqa: E402


def _make_skill_md(tmp_path: Path, line_count: int) -> Path:
    lines = ["---", "name: test-skill", "description: test", "---", "", "# Test Skill", ""]
    lines += [f"line {i}" for i in range(max(0, line_count - len(lines)))]
    path = tmp_path / "SKILL.md"
    path.write_text("\n".join(lines) + "\n")
    return path


def test_passing_diff_under_200_lines_passes(tmp_path):
    skill_md = _make_skill_md(tmp_path, line_count=50)
    diff = (
        "--- a/SKILL.md\n+++ b/SKILL.md\n@@ -5,1 +5,2 @@\n # Test Skill\n+- New scoped rule.\n"
    )
    result = review_diff(diff, skill_md)
    assert result.passed is True
    assert result.failures == []


def test_diff_that_pushes_file_over_200_lines_fails(tmp_path):
    skill_md = _make_skill_md(tmp_path, line_count=199)
    added_lines = "\n".join(f"+extra line {i}" for i in range(10))
    diff = f"--- a/SKILL.md\n+++ b/SKILL.md\n@@ -199,0 +199,10 @@\n{added_lines}\n"
    result = review_diff(diff, skill_md)
    assert result.passed is False
    assert any("200" in f or "line" in f.lower() for f in result.failures)


def test_diff_introducing_banned_frontmatter_field_fails(tmp_path):
    skill_md = _make_skill_md(tmp_path, line_count=50)
    diff = (
        "--- a/SKILL.md\n+++ b/SKILL.md\n@@ -1,4 +1,5 @@\n ---\n"
        " name: test-skill\n+version: 1.2.0\n description: test\n ---\n"
    )
    result = review_diff(diff, skill_md)
    assert result.passed is False
    assert any("version" in f.lower() or "banned" in f.lower() for f in result.failures)


def test_diff_touching_a_different_file_fails(tmp_path):
    skill_md = _make_skill_md(tmp_path, line_count=50)
    diff = "--- a/OTHER.md\n+++ b/OTHER.md\n@@ -1,1 +1,2 @@\n content\n+new content\n"
    result = review_diff(diff, skill_md)
    assert result.passed is False
    assert any("file" in f.lower() or "scope" in f.lower() for f in result.failures)


def test_no_change_justified_sentinel_fails_cleanly(tmp_path):
    skill_md = _make_skill_md(tmp_path, line_count=50)
    result = review_diff("NO_CHANGE_JUSTIFIED", skill_md)
    assert result.passed is False
    assert any("no change" in f.lower() for f in result.failures)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_review_skill_diff.py -v`
Expected: `ModuleNotFoundError: No module named 'scripts.review_skill_diff'`

- [ ] **Step 3: Write the minimal implementation**

Create `/Users/phillmcgurk/Pi-Dev-Ops/scripts/review_skill_diff.py`:

```python
"""
review_skill_diff.py — Mechanical subset of skill-authoring-standard's review-checklist
(RA-continuous-moa §6.4)

Checks the three items from Pi-Dev-Ops/skills/skill-authoring-standard/references/review-checklist.md
that are unambiguously mechanical:
  1. Structure gate: "SKILL.md <= 200 lines."
  2. Trigger gate: "No banned fields (version, owner_role, status, metadata.requires)
     without a stated reason."
  3. Design-elements gate (file-scope reading): the diff touches only the one target
     SKILL.md, nothing else.

Qualitative gates (duplication / single-source-of-truth, leading-word steering,
sediment/no-op pruning) are NOT mechanically checked here — they require reading
meaning, not counting lines. draft_skill_diff.py's dispatch prompt already
instructs the drafting agent to self-apply those; a human reviewing the PR is
the final gate for them, per design §6's "propose-via-PR only" framing.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

_MAX_LINES = 200
_BANNED_FRONTMATTER_FIELDS = ("version", "owner_role", "status", "metadata.requires")

_DIFF_FILE_HEADER_RE = re.compile(r"^\+\+\+ b/(.+)$", re.MULTILINE)
_ADDED_LINE_RE = re.compile(r"^\+(?!\+\+)(.*)$", re.MULTILINE)


@dataclass
class ReviewResult:
    passed: bool
    failures: list[str] = field(default_factory=list)


def _diff_target_files(diff_text: str) -> list[str]:
    return _DIFF_FILE_HEADER_RE.findall(diff_text)


def _added_lines(diff_text: str) -> list[str]:
    return _ADDED_LINE_RE.findall(diff_text)


def _resulting_line_count(skill_md_path: Path, diff_text: str) -> int:
    """Approximate the post-diff line count: current lines + net added lines
    (added minus removed). Good enough for a hard 200-line cap check without
    needing a real patch-apply dependency.
    """
    current = len(skill_md_path.read_text().splitlines())
    added = len(re.findall(r"^\+(?!\+\+)", diff_text, re.MULTILINE))
    removed = len(re.findall(r"^-(?!--)", diff_text, re.MULTILINE))
    return current + added - removed


def review_diff(diff_text: str, skill_md_path: Path) -> ReviewResult:
    failures: list[str] = []

    if diff_text.strip() == "NO_CHANGE_JUSTIFIED":
        return ReviewResult(passed=False, failures=["No change justified by drafting agent — nothing to review."])

    targets = _diff_target_files(diff_text)
    expected_name = skill_md_path.name
    if not targets:
        failures.append("Diff has no recognizable +++ b/ file header — cannot verify scope.")
    elif any(not t.endswith(expected_name) for t in targets):
        failures.append(
            f"Diff touches file(s) outside scope: {targets} — only {expected_name} is permitted."
        )
    if len(set(targets)) > 1:
        failures.append(f"Diff touches multiple files: {targets} — must be single-file, single-scoped.")

    if skill_md_path.exists():
        resulting_lines = _resulting_line_count(skill_md_path, diff_text)
        if resulting_lines > _MAX_LINES:
            failures.append(
                f"Resulting SKILL.md would be {resulting_lines} lines, over the {_MAX_LINES}-line cap."
            )

    for added in _added_lines(diff_text):
        for banned in _BANNED_FRONTMATTER_FIELDS:
            if re.match(rf"^\s*{re.escape(banned.split('.')[0])}\s*:", added):
                failures.append(f"Diff introduces banned frontmatter field: {banned}")

    return ReviewResult(passed=len(failures) == 0, failures=failures)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_review_skill_diff.py -v`
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git add scripts/review_skill_diff.py tests/test_review_skill_diff.py
git commit -m "feat(skill-self-update): add mechanical review-checklist gate"
```

---

### Task 5: Wire PR creation

**Files:**
- Create: `Pi-Dev-Ops/scripts/open_skill_pr.py`
- Create: `Pi-Dev-Ops/tests/test_open_skill_pr.py`

**Interfaces:**
- Consumes: a passing `ReviewResult` from Task 4 (only called when `result.passed is True`), the flagged skill's name, its grouped lessons (for the PR body excerpt), and the diff text.
- Produces: `ensure_label_exists(repo: str = _REPO) -> None`, `open_pr(skill_name: str, diff_text: str, lessons: list[dict], repo_path: Path = _ROOT) -> str` (returns the PR URL) — Task 6's orchestrator calls both in sequence.

**Why this does not literally reuse the `pr-creator` subagent.** `pr-creator` is defined at `RestoreAssist/.claude/agents/pr-creator.md` — read in full during research. It is a RestoreAssist-local Task-tool subagent (`tools: Bash, Read, Grep, Glob`) whose entire workflow is hardcoded to that repo's conventions: `gh pr create --base sandbox` (RestoreAssist's `sandbox` integration branch, confirmed from rule 18 in `AGENTS.md` — RestoreAssist PRs land on a feature branch or `sandbox`, never `main` directly), and it expects `RA-XXX` Linear-issue references in commit messages/branch names to link in the PR body. It has no target-repo parameter and no existing precedent anywhere in the codebase of being pointed at a different repo than its own working directory (confirmed by grepping every `pr-creator` reference in RestoreAssist's plans — all are same-repo dispatches, e.g. `docs/superpowers/plans/2026-06-26-onboarding-ai-key-gate-plan.md:211`: "Open PR via `pr-creator`").

This task's script is a small, Pi-Dev-Ops-scoped reimplementation of the same *pattern* `pr-creator` follows (branch → commit → push → `gh pr create` with a structured body) but targeting Pi-Dev-Ops's actual base branch (`main`, since Pi-Dev-Ops has no `sandbox` convention — confirmed via `gh api repos/CleanExpo/Pi-Dev-Ops/branches/main/protection`, which shows `main` itself is the protected, PR-gated branch) and its own title/label convention from the design spec, rather than RestoreAssist's `RA-XXX`/`sandbox` convention. This is a deliberate divergence from "invoke pr-creator as-is" flagged for the user in the final report — see the task summary.

- [ ] **Step 1: Write the failing tests**

Create `/Users/phillmcgurk/Pi-Dev-Ops/tests/test_open_skill_pr.py`:

```python
"""tests/test_open_skill_pr.py — PR-opening step for skill self-improvement (RA-continuous-moa §6.5)."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from scripts.open_skill_pr import branch_name, ensure_label_exists, pr_body, pr_title  # noqa: E402


def _lessons():
    return [
        {"ts": "2026-07-01T00:00:00Z", "source": "x", "applies_to_skill": "skill-authoring-standard",
         "lesson": "Line-count cap doesn't say whether frontmatter counts.", "severity": "warn"},
    ]


def test_pr_title_follows_skill_learn_convention():
    title = pr_title("skill-authoring-standard", _lessons())
    assert title.startswith("skill-learn(skill-authoring-standard):")
    assert "Line-count cap doesn't say whether frontmatter counts." in title


def test_pr_title_truncates_long_lesson_text():
    long_lesson = [{"lesson": "x" * 300, "severity": "warn", "source": "y", "ts": "2026-07-01T00:00:00Z",
                     "applies_to_skill": "test-skill"}]
    title = pr_title("test-skill", long_lesson)
    assert len(title) < 120


def test_branch_name_includes_skill_name_and_is_git_safe():
    name = branch_name("skill-authoring-standard")
    assert "skill-authoring-standard" in name
    assert " " not in name
    assert name.startswith("skill-self-update/")


def test_pr_body_includes_triggering_lesson_excerpt():
    body = pr_body("skill-authoring-standard", _lessons())
    assert "Line-count cap doesn't say whether frontmatter counts." in body
    assert "skill-authoring-standard" in body


def test_pr_body_includes_review_disclaimer():
    body = pr_body("skill-authoring-standard", _lessons())
    assert "auto-generated" in body.lower() or "review" in body.lower()


def test_ensure_label_exists_creates_when_missing(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if cmd[:3] == ["gh", "label", "list"]:
            class R:
                stdout = "bug\tSomething isn't working\n"
                returncode = 0
            return R()
        class R:
            stdout = ""
            returncode = 0
        return R()

    monkeypatch.setattr(subprocess, "run", fake_run)
    ensure_label_exists(repo="CleanExpo/Pi-Dev-Ops")
    create_calls = [c for c in calls if c[:3] == ["gh", "label", "create"]]
    assert len(create_calls) == 1
    assert "skill-self-update" in create_calls[0]


def test_ensure_label_exists_skips_when_present(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if cmd[:3] == ["gh", "label", "list"]:
            class R:
                stdout = "skill-self-update\tAuto-generated skill process fix\n"
                returncode = 0
            return R()
        class R:
            stdout = ""
            returncode = 0
        return R()

    monkeypatch.setattr(subprocess, "run", fake_run)
    ensure_label_exists(repo="CleanExpo/Pi-Dev-Ops")
    create_calls = [c for c in calls if c[:3] == ["gh", "label", "create"]]
    assert len(create_calls) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_open_skill_pr.py -v`
Expected: `ModuleNotFoundError: No module named 'scripts.open_skill_pr'`

- [ ] **Step 3: Write the minimal implementation**

Create `/Users/phillmcgurk/Pi-Dev-Ops/scripts/open_skill_pr.py`:

```python
"""
open_skill_pr.py — PR-opening step for skill self-improvement (RA-continuous-moa §6.5)

Pi-Dev-Ops-scoped reimplementation of the pr-creator pattern (branch -> commit
-> push -> gh pr create), targeting Pi-Dev-Ops's own base branch (main) and
title/label convention, rather than RestoreAssist's pr-creator subagent (which
is hardcoded to base=sandbox and RA-XXX Linear refs and has no target-repo
parameter — see Task 5 note in the plan).

Never merges. Only opens a PR on a new feature branch, per design §6's hard
constraint: never edits a SKILL.md directly on disk outside a PR branch, and
never self-merges.
"""
from __future__ import annotations

import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

_REPO = "CleanExpo/Pi-Dev-Ops"
_LABEL = "skill-self-update"
_LABEL_DESCRIPTION = "Auto-drafted SKILL.md fix from a recurring skill-process lesson"
_LABEL_COLOR = "5319e7"
_BASE_BRANCH = "main"
_MAX_TITLE_LEN = 100


def _first_lesson_summary(lessons: list[dict]) -> str:
    if not lessons:
        return "skill process update"
    text = lessons[0].get("lesson", "skill process update").strip()
    return text


def pr_title(skill_name: str, lessons: list[dict]) -> str:
    summary = _first_lesson_summary(lessons)
    prefix = f"skill-learn({skill_name}): "
    available = _MAX_TITLE_LEN - len(prefix)
    if len(summary) > available:
        summary = summary[: available - 1].rstrip() + "…"
    return prefix + summary


def branch_name(skill_name: str) -> str:
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"skill-self-update/{skill_name}-{date_str}"


def pr_body(skill_name: str, lessons: list[dict]) -> str:
    lines = [
        f"## Auto-drafted skill-process fix for `{skill_name}`",
        "",
        "This PR was opened automatically by the skill self-improvement loop "
        "(`scripts/skill_self_update.py`) after recurring lessons flagged this "
        "skill's own process/instructions as a source of confusion.",
        "",
        "### Triggering lesson(s)",
        "",
    ]
    for entry in lessons:
        severity = entry.get("severity", "info")
        source = entry.get("source", "unknown")
        ts = entry.get("ts", "unknown")
        lines.append(f"- [{severity}, from `{source}`, {ts}] {entry.get('lesson', '')}")
    lines += [
        "",
        "### Review required",
        "",
        "This diff is auto-generated and passed the mechanical subset of "
        "`skill-authoring-standard`'s review checklist (line count, banned "
        "frontmatter fields, single-file scope). It has NOT been checked for "
        "duplication, leading-word steering, or sediment — a human reviewer "
        "must confirm those before merging. Never self-merges.",
    ]
    return "\n".join(lines)


def ensure_label_exists(repo: str = _REPO) -> None:
    result = subprocess.run(
        ["gh", "label", "list", "--repo", repo],
        capture_output=True, text=True, check=False,
    )
    existing = {line.split("\t")[0] for line in result.stdout.splitlines() if line.strip()}
    if _LABEL in existing:
        return
    subprocess.run(
        [
            "gh", "label", "create", _LABEL,
            "--repo", repo,
            "--description", _LABEL_DESCRIPTION,
            "--color", _LABEL_COLOR,
        ],
        capture_output=True, text=True, check=False,
    )


def open_pr(skill_name: str, diff_text: str, lessons: list[dict], repo_path: Path = _ROOT) -> str:
    """Create branch, apply diff, commit, push, open PR. Returns the PR URL.
    Raises RuntimeError on any git/gh failure (caller decides how to log it).
    """
    ensure_label_exists()

    branch = branch_name(skill_name)
    skill_md_relpath = f"skills/{skill_name}/SKILL.md"

    subprocess.run(["git", "checkout", "main"], cwd=repo_path, check=True, capture_output=True)
    subprocess.run(["git", "pull", "--ff-only"], cwd=repo_path, check=True, capture_output=True)
    subprocess.run(["git", "checkout", "-b", branch], cwd=repo_path, check=True, capture_output=True)

    apply_result = subprocess.run(
        ["git", "apply", "-"], cwd=repo_path, input=diff_text, text=True, capture_output=True,
    )
    if apply_result.returncode != 0:
        raise RuntimeError(f"git apply failed for {skill_name}: {apply_result.stderr}")

    subprocess.run(["git", "add", skill_md_relpath], cwd=repo_path, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", f"skill-learn({skill_name}): auto-drafted process fix"],
        cwd=repo_path, check=True, capture_output=True,
    )
    subprocess.run(["git", "push", "-u", "origin", branch], cwd=repo_path, check=True, capture_output=True)

    title = pr_title(skill_name, lessons)
    body = pr_body(skill_name, lessons)
    pr_result = subprocess.run(
        [
            "gh", "pr", "create",
            "--repo", _REPO,
            "--base", _BASE_BRANCH,
            "--head", branch,
            "--title", title,
            "--body", body,
            "--label", _LABEL,
        ],
        cwd=repo_path, check=True, capture_output=True, text=True,
    )
    return pr_result.stdout.strip()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_open_skill_pr.py -v`
Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git add scripts/open_skill_pr.py tests/test_open_skill_pr.py
git commit -m "feat(skill-self-update): add Pi-Dev-Ops-scoped PR opener with skill-self-update label"
```

---

### Task 6: Wire the end-to-end orchestrator

**Files:**
- Create: `Pi-Dev-Ops/scripts/skill_self_update.py`
- Create: `Pi-Dev-Ops/tests/test_skill_self_update.py`

**Interfaces:**
- Consumes: `find_flagged_skills` (Task 2), `build_dispatch_prompt`/`write_draft` (Task 3), `review_diff` (Task 4), `open_pr` (Task 5) — imported directly, no new signatures invented here.
- Produces: `run_cycle(lessons_path: Path, dispatch_fn, min_count: int = 3, window_days: int = 30) -> list[dict]` — a list of `{"skill": str, "outcome": "pr_opened" | "rejected" | "no_change_justified", "detail": str}` result records, for whatever session or scheduled task calls this to log. `dispatch_fn` is an injected callable `(prompt: str) -> str` so tests can mock the LLM call without a real dispatch — production code will pass a real `Agent`-tool-backed function when this script is actually invoked from a Claude Code session (this script is a helper library, not a session-spawning process — it cannot call the `Agent` tool itself since that tool only exists inside a live Claude Code session; the session that runs the self-improvement cycle imports `run_cycle` and passes its own `Agent`-tool-backed dispatch function).

- [ ] **Step 1: Write the failing tests**

Create `/Users/phillmcgurk/Pi-Dev-Ops/tests/test_skill_self_update.py`:

```python
"""tests/test_skill_self_update.py — end-to-end orchestrator (RA-continuous-moa §6, full chain)."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from scripts import skill_self_update  # noqa: E402


def _write_lessons(path: Path, skill: str, count: int) -> None:
    with path.open("w") as f:
        for i in range(count):
            entry = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "source": "test",
                "applies_to_skill": skill,
                "lesson": f"lesson {i} about {skill}",
                "severity": "warn",
            }
            f.write(json.dumps(entry) + "\n")


def test_run_cycle_no_flagged_skills_returns_empty(tmp_path, monkeypatch):
    lessons_path = tmp_path / "lessons.jsonl"
    _write_lessons(lessons_path, "agent-expert", count=1)  # below default min_count=3

    def fail_dispatch(prompt: str) -> str:
        raise AssertionError("dispatch_fn should not be called when nothing is flagged")

    results = skill_self_update.run_cycle(lessons_path, dispatch_fn=fail_dispatch)
    assert results == []


def test_run_cycle_opens_pr_on_passing_diff(tmp_path, monkeypatch):
    lessons_path = tmp_path / "lessons.jsonl"
    _write_lessons(lessons_path, "agent-expert", count=3)

    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text("---\nname: agent-expert\n---\n\n# Agent Experts\n\ncontent\n")

    monkeypatch.setattr(
        skill_self_update, "_skill_md_path", lambda skill_name: skill_md
    )

    passing_diff = (
        "--- a/SKILL.md\n+++ b/SKILL.md\n@@ -5,1 +5,2 @@\n content\n+- New scoped rule.\n"
    )

    def fake_dispatch(prompt: str) -> str:
        assert "agent-expert" in prompt
        return passing_diff

    opened = {}

    def fake_open_pr(skill_name, diff_text, lessons, repo_path=REPO_ROOT):
        opened["skill_name"] = skill_name
        opened["diff_text"] = diff_text
        return "https://github.com/CleanExpo/Pi-Dev-Ops/pull/999"

    monkeypatch.setattr(skill_self_update, "open_pr", fake_open_pr)

    results = skill_self_update.run_cycle(lessons_path, dispatch_fn=fake_dispatch)

    assert len(results) == 1
    assert results[0]["skill"] == "agent-expert"
    assert results[0]["outcome"] == "pr_opened"
    assert "999" in results[0]["detail"]
    assert opened["skill_name"] == "agent-expert"


def test_run_cycle_rejects_and_does_not_open_pr_on_failing_diff(tmp_path, monkeypatch):
    lessons_path = tmp_path / "lessons.jsonl"
    _write_lessons(lessons_path, "agent-expert", count=3)

    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text("---\nname: agent-expert\n---\n\n# Agent Experts\n\ncontent\n")
    monkeypatch.setattr(skill_self_update, "_skill_md_path", lambda skill_name: skill_md)

    failing_diff = "--- a/OTHER.md\n+++ b/OTHER.md\n@@ -1,1 +1,2 @@\n x\n+y\n"

    def fake_dispatch(prompt: str) -> str:
        return failing_diff

    def fail_open_pr(*args, **kwargs):
        raise AssertionError("open_pr should not be called when review fails")

    monkeypatch.setattr(skill_self_update, "open_pr", fail_open_pr)

    results = skill_self_update.run_cycle(lessons_path, dispatch_fn=fake_dispatch)

    assert len(results) == 1
    assert results[0]["outcome"] == "rejected"


def test_run_cycle_handles_no_change_justified(tmp_path, monkeypatch):
    lessons_path = tmp_path / "lessons.jsonl"
    _write_lessons(lessons_path, "agent-expert", count=3)

    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text("---\nname: agent-expert\n---\n\n# Agent Experts\n\ncontent\n")
    monkeypatch.setattr(skill_self_update, "_skill_md_path", lambda skill_name: skill_md)

    def fake_dispatch(prompt: str) -> str:
        return "NO_CHANGE_JUSTIFIED"

    def fail_open_pr(*args, **kwargs):
        raise AssertionError("open_pr should not be called on NO_CHANGE_JUSTIFIED")

    monkeypatch.setattr(skill_self_update, "open_pr", fail_open_pr)

    results = skill_self_update.run_cycle(lessons_path, dispatch_fn=fake_dispatch)

    assert len(results) == 1
    assert results[0]["outcome"] == "no_change_justified"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_skill_self_update.py -v`
Expected: `ModuleNotFoundError: No module named 'scripts.skill_self_update'` (or `ImportError` for `skill_self_update`)

- [ ] **Step 3: Write the minimal implementation**

Create `/Users/phillmcgurk/Pi-Dev-Ops/scripts/skill_self_update.py`:

```python
"""
skill_self_update.py — End-to-end orchestrator for skill self-improvement
(RA-continuous-moa §6, composes Tasks 2-5)

Chains: scan_skill_lessons.find_flagged_skills -> draft_skill_diff.build_dispatch_prompt
-> [caller-supplied LLM dispatch] -> review_skill_diff.review_diff -> open_skill_pr.open_pr

This module cannot call the Agent tool itself (that tool only exists inside a
live Claude Code session). The session that runs a self-improvement cycle
imports run_cycle() and passes its own Agent-tool-backed dispatch function as
`dispatch_fn`. No standing cron calls this directly — per design §2/§3, this
loop is invoked only from within a session, same as the rest of the continuous
MOA loop it composes with.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Callable

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

from scripts.draft_skill_diff import build_dispatch_prompt, write_draft  # noqa: E402
from scripts.open_skill_pr import open_pr  # noqa: E402
from scripts.review_skill_diff import review_diff  # noqa: E402
from scripts.scan_skill_lessons import find_flagged_skills, group_by_skill, load_skill_lessons  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("pi-ceo.skill-self-update")

_HARNESS = _ROOT / ".harness"
_DEFAULT_LESSONS_PATH = _HARNESS / "lessons.jsonl"


def _skill_md_path(skill_name: str) -> Path:
    return _ROOT / "skills" / skill_name / "SKILL.md"


def run_cycle(
    lessons_path: Path,
    dispatch_fn: Callable[[str], str],
    min_count: int = 3,
    window_days: int = 30,
) -> list[dict]:
    lessons = load_skill_lessons(lessons_path)
    groups = group_by_skill(lessons)
    flagged = find_flagged_skills(groups, min_count=min_count, window_days=window_days)

    results: list[dict] = []

    for skill_name, entries in flagged.items():
        skill_md_path = _skill_md_path(skill_name)
        if not skill_md_path.exists():
            log.warning("Flagged skill %s has no SKILL.md at %s — skipping", skill_name, skill_md_path)
            results.append({
                "skill": skill_name,
                "outcome": "rejected",
                "detail": f"SKILL.md not found at {skill_md_path}",
            })
            continue

        prompt = build_dispatch_prompt(skill_name, skill_md_path, entries)
        diff_text = dispatch_fn(prompt)

        if diff_text.strip() == "NO_CHANGE_JUSTIFIED":
            log.info("Skill %s: drafting agent found no change justified", skill_name)
            results.append({
                "skill": skill_name,
                "outcome": "no_change_justified",
                "detail": "Drafting agent determined lessons did not justify a change.",
            })
            continue

        write_draft(skill_name, diff_text)

        review_result = review_diff(diff_text, skill_md_path)
        if not review_result.passed:
            log.info("Skill %s: diff rejected — %s", skill_name, "; ".join(review_result.failures))
            results.append({
                "skill": skill_name,
                "outcome": "rejected",
                "detail": "; ".join(review_result.failures),
            })
            continue

        pr_url = open_pr(skill_name, diff_text, entries)
        log.info("Skill %s: PR opened — %s", skill_name, pr_url)
        results.append({
            "skill": skill_name,
            "outcome": "pr_opened",
            "detail": pr_url,
        })

    return results


if __name__ == "__main__":
    log.error(
        "skill_self_update.py has no standalone entry point — it must be invoked "
        "from a live Claude Code session that supplies an Agent-tool-backed "
        "dispatch_fn. Import run_cycle() instead of running this script directly."
    )
    sys.exit(1)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_skill_self_update.py -v`
Expected: `4 passed`

- [ ] **Step 5: Run the full test suite for this feature together**

Run: `cd /Users/phillmcgurk/Pi-Dev-Ops && python3 -m pytest tests/test_scan_skill_lessons.py tests/test_draft_skill_diff.py tests/test_review_skill_diff.py tests/test_open_skill_pr.py tests/test_skill_self_update.py -v`
Expected: `28 passed` (8 + 5 + 5 + 6 + 4)

- [ ] **Step 6: Commit**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git add scripts/skill_self_update.py tests/test_skill_self_update.py
git commit -m "feat(skill-self-update): wire end-to-end orchestrator (scan -> draft -> review -> PR)"
```

---

### Task 7: Open the PR for this feature itself

**Files:** none new — this is the PR-open step for the branch created across Tasks 1-6.

**Interfaces:**
- Consumes: all commits from Tasks 1-6 on branch `skill-self-update/applies-to-skill-field`.
- Produces: a PR URL for human review.

- [ ] **Step 1: Push the branch**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git push -u origin skill-self-update/applies-to-skill-field
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --repo CleanExpo/Pi-Dev-Ops \
  --base main \
  --head skill-self-update/applies-to-skill-field \
  --title "feat(skill-self-update): propose-via-PR loop for skill-process lessons" \
  --body "$(cat <<'EOF'
## Summary
- Adds optional `applies_to_skill` field to the lessons.jsonl schema (documented in agent-expert/SKILL.md — no lesson-writer script exists to modify).
- Adds `scripts/scan_skill_lessons.py`: threshold scan (min_count=3 in 30 days, mirroring analyse_lessons.py's min_count=2 pattern one level stricter).
- Adds `scripts/draft_skill_diff.py`: builds the LLM dispatch prompt for a single, scoped, append-only SKILL.md diff.
- Adds `scripts/review_skill_diff.py`: mechanical subset of skill-authoring-standard's review-checklist (line count, banned frontmatter, file scope).
- Adds `scripts/open_skill_pr.py`: Pi-Dev-Ops-scoped PR opener (creates `skill-self-update` label if missing, opens PR against `main` per real branch protection).
- Adds `scripts/skill_self_update.py`: orchestrator chaining all of the above, invoked from a live session (not a standing cron).

Implements design spec §6 (Phase 3 — Self-improving skills) from
RestoreAssist's `docs/superpowers/specs/2026-07-03-continuous-moa-agent-loop-design.md`.

## Test plan
- [ ] `python3 -m pytest tests/test_scan_skill_lessons.py tests/test_draft_skill_diff.py tests/test_review_skill_diff.py tests/test_open_skill_pr.py tests/test_skill_self_update.py -v` — 28 passed
- [ ] Manual: confirm `skill-self-update` label was created on this repo after `ensure_label_exists()` first runs
- [ ] Never self-merges — confirm this PR itself required human approval to land

---
Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report the PR URL back to the user.**

---

## Self-Review

**1. Spec coverage** — walking design spec §6 point by point:
- Point 1 (`applies_to_skill` field, exact before/after schema, concrete example) → Task 1. Confirmed the mechanism is a documented procedure (14-line SKILL.md), not a script — flagged explicitly rather than inventing a script to modify.
- Point 2 (threshold-scan job, language/runtime matching `analyzing-customer-patterns`'s convention, concrete default numbers, TDD with synthetic fixture) → Task 2. Threshold derived from two real, cited conventions (`analyse_lessons.py`'s `min_count=2`, `analyzing-customer-patterns`'s 30-day window) rather than invented numbers.
- Point 3 (scoped-diff drafter, single section, append-only, concrete LLM dispatch prompt written in full) → Task 3. Full prompt text included, no "prompt the model to draft a diff" placeholder.
- Point 4 (review-checklist gate, real checklist items, concrete pass/fail logic, discard vs retry decision with justification) → Task 4. Used the real checklist verbatim, explicitly separated mechanical vs qualitative items, chose discard-and-log with justification against the spec's own wording.
- Point 5 (PR creation via pr-creator or the mechanism it actually uses, correct repo, branch-protection convention, title/label convention, label-creation step) → Task 5 + Task 6. Investigated `pr-creator` in full, found it RestoreAssist-local and not reusable as-is, built a Pi-Dev-Ops-scoped equivalent following the same pattern — flagged as a deliberate divergence.
- Hard constraint (never self-merge, never edit SKILL.md outside a PR branch) → enforced structurally: `open_pr()` always creates a feature branch first and only ever calls `gh pr create`, never `gh pr merge`; no function in any task writes to a `skills/*/SKILL.md` path outside of `git apply` on a checked-out feature branch.

**2. Placeholder scan** — searched for "TBD", "similar to Task N", "add appropriate error handling" style language across all seven tasks. None found; every step has complete, runnable code. The one place a weaker plan would hand-wave — "prompt the model to draft a diff" — is instead the full `DISPATCH_PROMPT_TEMPLATE` text in Task 3.

**3. Type/interface consistency** — traced signatures across tasks:
- `find_flagged_skills(groups, min_count=3, window_days=30) -> dict[str, list[dict]]` (Task 2) is called with the same parameter names and defaults in Task 6's `run_cycle`.
- `build_dispatch_prompt(skill_name, skill_md_path, lessons)` (Task 3) — Task 6 calls it positionally with the same three arguments in the same order.
- `write_draft(skill_name, diff_text, output_dir=_DRAFTS_DIR)` (Task 3) — Task 6 calls it with two positional args, relying on the same default `output_dir`.
- `review_diff(diff_text, skill_md_path) -> ReviewResult` (Task 4) — Task 6 calls it with the same two arguments in the same order and reads `.passed` / `.failures`, matching the dataclass fields defined in Task 4.
- `open_pr(skill_name, diff_text, lessons, repo_path=_ROOT) -> str` (Task 5) — Task 6 calls it with three positional args, and Task 6's own test monkeypatches a `fake_open_pr(skill_name, diff_text, lessons, repo_path=REPO_ROOT)` matching that exact signature.
- All five scripts import from `scripts.<name>` (matching `analyse_lessons.py`'s own `sys.path.insert(0, str(_ROOT))` + package-relative import convention) — no drift between how Task 2's tests import `scan_skill_lessons` and how Task 6 imports it.

No gaps or mismatches found on this pass.
