# Nexus Prompt — TEST FIXTURE (not the real prompt)

Minimal stand-in used only by `scripts/__tests__/linear-loop-decide.test.ts` to keep
the decision-CLI subprocess hermetic. The real `NEXUS_PROMPT.md` lives in the `nexus`
skill at `~/.claude/skills/nexus/references/` and is intentionally absent on CI runners,
so the test points `NEXUS_PROMPT_PATH` here instead. The only contract this fixture must
honour is the single `{TASK}` placeholder that `wrapWithNexus()` substitutes.

Task:
{TASK}
