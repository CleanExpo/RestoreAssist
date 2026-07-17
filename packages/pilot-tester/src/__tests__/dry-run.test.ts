import { describe, expect, it } from "vitest";
import { dryRun } from "../runner/dry-run.js";

describe("dryRun", () => {
  it("passes against the committed fixtures + manifest", async () => {
    const ok = await dryRun();
    expect(ok).toBe(true);
  }, 15_000);
});
