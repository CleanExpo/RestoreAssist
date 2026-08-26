import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error -- plain .mjs helper, no type declarations
import { parseCssTokens, parseDocTokens, findDrift } from "../check-design-tokens.mjs";

/**
 * .github/scripts/design-md-lint.sh checks that six H2 headings exist. It
 * passed for months while .claude/DESIGN.md documented an orange
 * `--ra-primary #E55A2B` palette with Inter and JetBrains Mono, sourced from a
 * `Synthex/packages/brand-config` path outside this repo. None of it was real:
 * no `--ra-*` token appeared anywhere, Inter was never loaded as a font, and
 * `Synthex/` did not exist — while the app shipped navy, bronze and Geist.
 *
 * Headings being present says nothing about whether the contents are true.
 */

const ROOT = process.cwd();
const GATE = join(ROOT, "scripts", "check-design-tokens.mjs");

function runGate(): { code: number; output: string } {
  try {
    return {
      code: 0,
      output: execFileSync("node", [GATE], { encoding: "utf8", cwd: ROOT }),
    };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("check-design-tokens parsing", () => {
  it("reads brand tokens out of CSS", () => {
    const tokens = parseCssTokens(
      "--color-brand-navy: #1c2e47; /* c */\n--color-brand-bronze:#8A6B4E;\n--unrelated: #fff;",
    );
    expect(tokens.get("--color-brand-navy")).toBe("#1c2e47");
    // Case is normalised, or a hex differing only in case reads as drift.
    expect(tokens.get("--color-brand-bronze")).toBe("#8a6b4e");
    expect(tokens.has("--unrelated")).toBe(false);
  });

  it("reads tokens out of a DESIGN.md table row", () => {
    const tokens = parseDocTokens(
      "| Token | Hex | Use |\n|---|---|---|\n| `--color-brand-navy` | `#1C2E47` | Primary |",
    );
    expect(tokens.get("--color-brand-navy")).toBe("#1c2e47");
  });

  it("reports a token the CSS does not declare", () => {
    const drift = findDrift(new Map(), new Map([["--ra-primary", "#e55a2b"]]));
    expect(drift).toEqual([
      { token: "--ra-primary", kind: "undeclared", documented: "#e55a2b" },
    ]);
  });

  it("reports a hex the CSS disagrees with", () => {
    const drift = findDrift(
      new Map([["--color-brand-navy", "#1c2e47"]]),
      new Map([["--color-brand-navy", "#e55a2b"]]),
    );
    expect(drift[0]).toMatchObject({ kind: "mismatch", actual: "#1c2e47" });
  });

  // Deliberate asymmetry: globals.css carries implementation-detail tokens that
  // are not brand contract, and forcing each into DESIGN.md would make the doc
  // a worse contract rather than a better one.
  it("does not demand that every CSS token be documented", () => {
    const drift = findDrift(
      new Map([["--color-brand-navy", "#1c2e47"], ["--color-brand-ink", "#0a0a0a"]]),
      new Map([["--color-brand-navy", "#1c2e47"]]),
    );
    expect(drift).toEqual([]);
  });
});

describe("check-design-tokens gate", () => {
  it("passes against the DESIGN.md in the tree", () => {
    const r = runGate();
    expect(r.output).toContain("OK:");
    expect(r.code).toBe(0);
  });

  it("would have caught the orange palette that shipped in the docs", () => {
    // The exact rows the old file carried.
    const stale = parseDocTokens(
      "| `--ra-primary` | `#E55A2B` | Brand primary |\n" +
        "| `--ra-accent` | `#C5E063` | Lime |",
    );
    const real = parseCssTokens(readFileSync(join(ROOT, "app", "globals.css"), "utf8"));
    const drift = findDrift(real, stale);
    expect(drift).toHaveLength(2);
    expect(drift.every((d: { kind: string }) => d.kind === "undeclared")).toBe(true);
  });
});

describe("DESIGN.md content", () => {
  it("no longer points at a source of truth outside this repository", () => {
    const design = readFileSync(join(ROOT, ".claude", "DESIGN.md"), "utf8");
    // Named three times as "source of truth" while never existing here.
    expect(existsSync(join(ROOT, "Synthex"))).toBe(false);
    const sourceOfTruthLines = design
      .split("\n")
      .filter((l) => /source of truth/i.test(l));
    expect(sourceOfTruthLines.length).toBeGreaterThan(0);
    expect(sourceOfTruthLines.join("\n")).toContain("globals.css");
  });

  it("does not name a font the app never loads", () => {
    const design = readFileSync(join(ROOT, ".claude", "DESIGN.md"), "utf8");
    const typography = design.slice(design.indexOf("### Typography"));
    expect(typography).toContain("Geist");
    expect(typography.slice(0, 400)).not.toContain("JetBrains");
  });
});
