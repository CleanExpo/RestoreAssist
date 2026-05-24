import { describe, expect, it } from "vitest";
import { canTransition, type HydrationState } from "../hydration-state-machine";

describe("canTransition", () => {
  it.each<[HydrationState, HydrationState, boolean]>([
    ["pending", "running", true],
    ["running", "ready", true],
    ["running", "error", true],
    ["running", "manual", true],
    ["ready", "running", true],
    ["error", "running", true],
    ["manual", "ready", true],
    ["ready", "pending", false],
    ["error", "pending", false],
  ])("%s -> %s is %s", (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });
});
