import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * RA-8452 (kind J: "a background job writes a terminal status that no screen,
 * alert or retry path knows about"). The one owner for terminal failures is
 * runCronJob: a handler returns `terminalFailures`, and the runner raises the
 * alert and records the count. This test makes it impossible to add a cron
 * module that writes a FAILED or DEAD_LETTER status without either reporting
 * `terminalFailures` or being listed below with the reader that surfaces it.
 */

const repoRoot = path.resolve(__dirname, "../../../../..");

const SCANNED_DIRS = ["lib/cron", "lib/lifecycle/subscribers"];

/** A `data: { ... status: ... "FAILED" | "DEAD_LETTER" ... }` write. */
const TERMINAL_WRITE = /data:\s*\{[^}]*?\bstatus:[^,\n]*"(FAILED|DEAD_LETTER)"/s;

/**
 * Modules that write a terminal status but surface it some other way. Each
 * entry names that reader; an entry that no longer writes a terminal status
 * fails the test so the list cannot go stale.
 */
const SURFACED_ELSEWHERE: Record<string, string> = {
  "lib/cron/advance-workflows.ts":
    "AgentWorkflow FAILED is listed on app/dashboard/admin/workflows/page.tsx",
  "lib/lifecycle/subscribers/mirror-recovery.ts":
    "not run through runCronJob; DEAD_LETTER writes an admin Notification (RA-8451)",
};

function cronModules(): string[] {
  return SCANNED_DIRS.flatMap((dir) =>
    fs
      .readdirSync(path.join(repoRoot, dir))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => `${dir}/${f}`),
  );
}

function writesTerminalStatus(rel: string): boolean {
  return TERMINAL_WRITE.test(fs.readFileSync(path.join(repoRoot, rel), "utf8"));
}

describe("terminal failures have one owner (RA-8452)", () => {
  const writers = cronModules().filter(writesTerminalStatus);

  it("the scan finds the known writers (positive control)", () => {
    expect(writers).toContain("lib/cron/media-cleanup.ts");
    expect(writers).toContain("lib/lifecycle/subscribers/mirror-recovery.ts");
  });

  it("every module writing FAILED or DEAD_LETTER reports terminalFailures", () => {
    const silent = writers.filter(
      (rel) =>
        !(rel in SURFACED_ELSEWHERE) &&
        !/\bterminalFailures\b/.test(fs.readFileSync(path.join(repoRoot, rel), "utf8")),
    );
    expect(silent).toEqual([]);
  });

  it("every SURFACED_ELSEWHERE entry still writes a terminal status", () => {
    const stale = Object.keys(SURFACED_ELSEWHERE).filter((rel) => !writers.includes(rel));
    expect(stale).toEqual([]);
  });
});
