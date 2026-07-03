/**
 * Nexus-wraps a task string per the nexus skill's documented procedure:
 * /Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md, step 1-2.
 *
 * Reads references/NEXUS_PROMPT.md verbatim and substitutes {TASK} — never
 * restates or forks the prompt body, per the skill's explicit instruction.
 */

import { readFileSync } from "fs";
import { join } from "path";

const NEXUS_PROMPT_PATH = join(
  "/Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/references/NEXUS_PROMPT.md",
);

let cachedPromptTemplate: string | null = null;

function loadNexusPromptTemplate(): string {
  if (cachedPromptTemplate === null) {
    cachedPromptTemplate = readFileSync(NEXUS_PROMPT_PATH, "utf-8");
  }
  return cachedPromptTemplate;
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
      `NEXUS_PROMPT.md at ${NEXUS_PROMPT_PATH} no longer contains a {TASK} placeholder — ` +
        "the nexus skill's prompt contract may have changed; re-read the skill before dispatching.",
    );
  }
  return template.replace("{TASK}", task);
}
