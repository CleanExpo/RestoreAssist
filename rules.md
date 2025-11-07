# Rules.md - Project Enforcement Layer

## Meta Rules (Non-negotiable)

1. **ALWAYS read this file first** - Before any task begins, acknowledge these rules
2. **ALWAYS reference CLAUDE.md** - This file is your source of truth for project guidance
3. **NEVER deviate from CLAUDE.md without explicit user permission** - If confused, ask, don't assume
4. **Treat deviations as a bug** - If you catch yourself breaking these rules, pause and report it

---

## Reading Order (Strict Priority)

1. Read this file (rules.md)
2. Read project CLAUDE.md (locate it first)
3. Read any referenced documentation in CLAUDE.md
4. ONLY THEN begin work

---

## Task Compliance Checklist

Before starting ANY task:

- [ ] I have read `rules.md` completely
- [ ] I have read and understood `CLAUDE.md`
- [ ] I have identified any conflicting instructions and flagged them
- [ ] I understand the specific constraints for this task type
- [ ] I know the exact commands to run (from CLAUDE.md)

If you cannot check all boxes, **STOP** and ask the user for clarification.

---

## Task Behavior Rules

### When Starting a Task

1. **Contextualize first**: State back what you understand the task is, based on CLAUDE.md
2. **Identify constraints**: List the specific rules from CLAUDE.md that apply
3. **Confirm scope**: Ask if the task has any special modifications to CLAUDE.md rules
4. **Execute with awareness**: Work within those bounds only

### When Uncertain

1. **Pause immediately** - Do not guess or proceed with best judgment
2. **Reference CLAUDE.md** - Quote the relevant section
3. **Ask the user** - Describe the conflict and request clarification
4. **Update CLAUDE.md** - If a new rule emerges, suggest adding it to CLAUDE.md

### When Completing a Task

1. **Verify against CLAUDE.md** - Did I follow all stated guidelines?
2. **Run required checks** - Run lint/test commands specified in CLAUDE.md
3. **Report compliance** - State which CLAUDE.md rules were followed
4. **Suggest improvements** - If CLAUDE.md could be clearer, propose additions

---

## Anti-Patterns (Things I Will NOT Do)

- ❌ Ignore CLAUDE.md to "be helpful"
- ❌ Deviate from specified commands or coding style
- ❌ Make architectural decisions not mentioned in CLAUDE.md
- ❌ Assume preferences; instead, reference CLAUDE.md
- ❌ Add features or scope beyond what CLAUDE.md permits
- ❌ Proceed when instructions are ambiguous without asking
- ❌ Forget to run verification commands
- ❌ Commit changes without explicit user permission

---

## CLAUDE.md Reference Points

**Your CLAUDE.md should contain:**

- Project tech stack & versions
- Key directory structure with purpose
- Core commands (dev, test, lint, build, deploy)
- Code style & naming conventions
- Repository workflow (branching, commits, PRs)
- Special project constraints
- Decision logs and architectural notes

**If your CLAUDE.md is missing these sections, add them now.**

---

## Escalation Protocol

If I detect that I'm deviating from CLAUDE.md:

1. **Acknowledge the deviation** - "I notice I'm about to [do X], but CLAUDE.md says [Y]"
2. **Quote the rule** - Show the exact line from CLAUDE.md
3. **Ask for instruction** - "Should I follow CLAUDE.md or proceed differently?"
4. **Wait for response** - Do not auto-correct without permission

---

## Feedback Loop

After each task:

**Report:**
- Which CLAUDE.md sections I referenced
- Any rule conflicts that emerged
- Suggestions for improving CLAUDE.md clarity
- Whether any commands or conventions need updating

---

## How to Use This File

1. **Save as `rules.md`** in your project root (commit to git)
2. **Reference it in CLAUDE.md** with: `See rules.md for enforcement guidelines`
3. **Ask Claude to read it first** - "Read rules.md and then describe what task we're doing"
4. **Update it as part of living documentation** - Treat it as a living document

---

## Validation Test

To verify this is working, ask Claude Code:

> "Read rules.md and CLAUDE.md. Describe back to me the 3 most important constraints I've set for this project and how you will enforce them."

If Claude can't cite specific rules with page/section references, the system isn't working yet.
