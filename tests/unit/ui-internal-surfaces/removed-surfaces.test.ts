/**
 * Guard: internal engineering surfaces are not part of the customer app.
 * Mission Control (Hermes paths, ports, hub names) and the mobile build-status
 * page were reachable by any self-registered business owner.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");

describe("removed internal surfaces", () => {
  it.each([
    "app/dashboard/mission-control",
    "app/api/mission-control",
    "app/dashboard/mobile",
  ])("%s no longer exists", (p) => {
    expect(existsSync(resolve(root, p))).toBe(false);
  });

  it("no source file links to the removed routes", () => {
    // git grep exits 1 when nothing matches; that is the passing case.
    const r = spawnSync(
      "git",
      [
        "grep",
        "-n",
        "-E",
        "/dashboard/mission-control|/api/mission-control|/dashboard/mobile",
        "--",
        "app",
        "components",
        "lib",
        ":(exclude)lib/__tests__/page-route-reachability.test.ts",
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
  });

  it("the Margot home page names no operator infrastructure", () => {
    const r = spawnSync(
      "git",
      [
        "grep",
        "-n",
        "-i",
        "-E",
        "Hermes|Mac mini|SOUL\\.md",
        "--",
        "app/dashboard/margot/home",
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
  });

  it("no code reads NEXT_PUBLIC_HERMES_OPS_URL (it would ship in the browser bundle)", () => {
    const r = spawnSync(
      "git",
      [
        "grep",
        "-n",
        "NEXT_PUBLIC_HERMES_OPS_URL",
        "--",
        "app",
        "components",
        "lib",
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
  });
});
