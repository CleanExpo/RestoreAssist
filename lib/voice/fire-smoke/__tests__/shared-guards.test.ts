import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Kind K11 (rounds 15 and 19): a guarantee kept per branch, so one branch skipped it. */
describe("every fire action passes the shared guards before any branch", () => {
  const source = readFileSync(join(__dirname, "..", "actions.ts"), "utf8");
  const body = source.slice(source.indexOf("export async function runFireAction("));

  it("the notice is checked in one place only", () => {
    expect(source.match(/noticeAcknowledged/g) ?? []).toHaveLength(1);
    expect(source.match(/return NOTICE_REQUIRED/g) ?? []).toHaveLength(1);
  });

  it("runFireAction calls the shared guard before it branches on the action", () => {
    const guard = body.indexOf("sharedRefusal(action, before.status)");
    const firstBranch = body.indexOf("if (action.action ===");
    expect(guard).toBeGreaterThan(0);
    expect(firstBranch).toBeGreaterThan(guard);
  });
});
