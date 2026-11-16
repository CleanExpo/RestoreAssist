/**
 * RA-8399 — one owner for creating a support ticket.
 *
 * `createSupportTicket()` in lib/support/create-ticket.ts saves the row AND
 * alerts staff. Any other file calling `supportTicket.create` would save a
 * ticket nobody is told about, which is the defect this ticket closed. This
 * test walks the app's own source (tests excluded) and allows exactly one
 * caller.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..", "..");
const SOURCE_ROOTS = ["app", "components", "lib", "hooks"];
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs)$/;
const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;
const OWNER = "lib/support/create-ticket.ts";

// Matches `prisma.supportTicket.create(` and `tx.supportTicket.create(`, with
// optional whitespace, but not `createMany`.
const CREATE_CALL = /\bsupportTicket\s*\.\s*create\s*\(/;

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith("."))
      continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const sources = SOURCE_ROOTS.flatMap((root) => walk(join(repoRoot, root), []))
  .filter((f) => SOURCE_EXT.test(f) && !TEST_FILE.test(f))
  .map((f) => relative(repoRoot, f).split(sep).join("/"));

describe("supportTicket.create has one owner (RA-8399)", () => {
  it("searches the app source and finds the owner's own call (positive control)", () => {
    expect(sources.length).toBeGreaterThan(1000);
    expect(sources).toContain(OWNER);
    expect(CREATE_CALL.test(readFileSync(join(repoRoot, OWNER), "utf8"))).toBe(
      true,
    );
    expect(CREATE_CALL.test("prisma.supportTicket.createMany({")).toBe(false);
  });

  it("allows no other file to create a support ticket directly", () => {
    const callers = sources
      .filter((f) => CREATE_CALL.test(readFileSync(join(repoRoot, f), "utf8")))
      .sort();
    expect(callers).toEqual([OWNER]);
  });
});
