/**
 * Nexus-wraps a task string per the nexus skill's documented procedure:
 * ~/.claude/skills/nexus/SKILL.md, step 1-2 (fleet-wide convention: the
 * nexus skill is symlinked into ~/.claude/skills/nexus on every machine).
 *
 * Reads references/NEXUS_PROMPT.md verbatim and substitutes {TASK} — never
 * restates or forks the prompt body, per the skill's explicit instruction.
 */

import { readFileSync } from "fs";
import os from "os";
import { join } from "path";

/**
 * Resolved lazily (not hoisted into a module-level constant) so that tests
 * can set `process.env.NEXUS_PROMPT_PATH` before the first call and have it
 * take effect, without needing module re-registration.
 */
function resolveNexusPromptPath(): string {
  return (
    process.env.NEXUS_PROMPT_PATH ??
    join(os.homedir(), ".claude", "skills", "nexus", "references", "NEXUS_PROMPT.md")
  );
}

let cachedPromptTemplate: string | null = null;

function loadNexusPromptTemplate(): string {
  if (cachedPromptTemplate === null) {
    const promptPath = resolveNexusPromptPath();
    try {
      cachedPromptTemplate = readFileSync(promptPath, "utf-8");
    } catch (error) {
      throw new Error(
        `Could not read the Nexus prompt template at "${promptPath}". ` +
          "Set the NEXUS_PROMPT_PATH environment variable to point at NEXUS_PROMPT.md, " +
          "or install the nexus skill at ~/.claude/skills/nexus. " +
          `(underlying error: ${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }
  return cachedPromptTemplate;
}

/**
 * Test-only: clears the module-level template cache so tests can point
 * NEXUS_PROMPT_PATH at a fixture and force a fresh read. Not used by
 * production dispatch code — the cache is intentionally permanent there
 * (the template doesn't change within a process lifetime).
 */
export function __resetNexusPromptCacheForTests(): void {
  cachedPromptTemplate = null;
}

/**
 * Fills the Nexus Prompt's {TASK} placeholder with the complete task text.
 * Callers must pass a task string that already includes the why and any
 * hard constraints, per the nexus skill's step 2 — this function does not
 * add context on the caller's behalf.
 */
export function wrapWithNexus(task: string): string {
  const template = loadNexusPromptTemplate();
  if (!template.includes("{TASK}")) {
    throw new Error(
      `NEXUS_PROMPT.md at ${resolveNexusPromptPath()} no longer contains a {TASK} placeholder — ` +
        "the nexus skill's prompt contract may have changed; re-read the skill before dispatching.",
    );
  }
  return template.replace("{TASK}", task);
}
