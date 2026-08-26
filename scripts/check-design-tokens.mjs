#!/usr/bin/env node
/**
 * DESIGN.md token drift gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * .github/scripts/design-md-lint.sh checks that six H2 headings are present.
 * It passed for months while DESIGN.md declared an entirely fictional palette:
 * an orange `--ra-primary #E55A2B` with Inter and JetBrains Mono, sourced from
 * a `Synthex/packages/brand-config` path outside this repository. Not one of
 * those tokens appeared in any file, Inter was never loaded as a font, and
 * `Synthex/` did not exist -- while the app shipped navy, bronze and Geist.
 *
 * Any agent that read DESIGN.md and generated UI from it produced off-brand
 * work, and no check could tell. Headings being present says nothing about
 * whether the contents are true.
 *
 * This gate compares the token tables in DESIGN.md against the custom
 * properties actually declared in app/globals.css, in both directions:
 *   - a token DESIGN.md documents that globals.css does not declare
 *   - a hex that differs between the two
 *
 * Run: npm run check:design-tokens
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const GLOBALS = join(ROOT, "app", "globals.css");
const DESIGN = join(ROOT, ".claude", "DESIGN.md");

/** `--color-brand-navy: #1c2e47;` -> Map("--color-brand-navy" => "#1c2e47") */
export function parseCssTokens(css) {
  const tokens = new Map();
  for (const [, name, hex] of css.matchAll(
    /(--color-brand-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  )) {
    tokens.set(name, hex.toLowerCase());
  }
  return tokens;
}

/** `| \`--color-brand-navy\` | \`#1c2e47\` | ... |` from a markdown table. */
export function parseDocTokens(markdown) {
  const tokens = new Map();
  for (const [, name, hex] of markdown.matchAll(
    /^\|\s*`(--[a-z0-9-]+)`\s*\|\s*`(#[0-9a-fA-F]{3,8})`\s*\|/gm,
  )) {
    tokens.set(name, hex.toLowerCase());
  }
  return tokens;
}

/**
 * Compare the two. Documented tokens must exist in CSS and agree on the hex.
 *
 * The reverse is deliberately NOT an error: globals.css carries many tokens
 * that are implementation detail rather than brand contract, and forcing every
 * one into DESIGN.md would make the doc a worse contract, not a better one.
 */
export function findDrift(cssTokens, docTokens) {
  const drift = [];
  for (const [name, docHex] of docTokens) {
    const cssHex = cssTokens.get(name);
    if (cssHex === undefined) {
      drift.push({ token: name, kind: "undeclared", documented: docHex });
    } else if (cssHex !== docHex) {
      drift.push({ token: name, kind: "mismatch", documented: docHex, actual: cssHex });
    }
  }
  return drift;
}

function main() {
  const cssTokens = parseCssTokens(readFileSync(GLOBALS, "utf8"));
  const docTokens = parseDocTokens(readFileSync(DESIGN, "utf8"));

  if (docTokens.size === 0) {
    console.error(
      "FAIL: DESIGN.md declares no `--token` / `#hex` table rows. Either the " +
        "tables were removed or their format changed -- this gate would " +
        "silently pass on an empty set, which is how the last drift survived.",
    );
    process.exit(1);
  }

  const drift = findDrift(cssTokens, docTokens);
  if (drift.length > 0) {
    console.error(
      `FAIL: ${drift.length} token(s) in .claude/DESIGN.md do not match app/globals.css.\n`,
    );
    for (const d of drift) {
      if (d.kind === "undeclared") {
        console.error(
          `  ${d.token}: documented as ${d.documented}, but app/globals.css declares no such token.`,
        );
      } else {
        console.error(
          `  ${d.token}: DESIGN.md says ${d.documented}, app/globals.css says ${d.actual}.`,
        );
      }
    }
    console.error(
      "\napp/globals.css is the source of truth. Update DESIGN.md to match it.",
    );
    process.exit(1);
  }

  console.log(
    `OK: ${docTokens.size} DESIGN.md tokens match app/globals.css (of ${cssTokens.size} brand tokens declared).`,
  );
}

// Only run when invoked directly, so the tests can import the helpers.
if (process.argv[1] && process.argv[1].endsWith("check-design-tokens.mjs")) {
  main();
}
