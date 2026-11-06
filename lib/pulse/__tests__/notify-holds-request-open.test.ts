import { beforeEach, describe, expect, it, vi } from "vitest";

const { after, findUnique } = vi.hoisted(() => ({
  after: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/prisma", () => ({
  prisma: { inspection: { findUnique } },
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("../dispatcher", () => ({
  dispatchPulseNotification: vi.fn(),
  dryingAreaStates: vi.fn(),
  parseDryingTemplateKey: vi.fn(),
}));

import {
  notifyClientDryingChange,
  notifyClientStepChange,
} from "../notify-client-change";

const callers = [
  ["step", () => notifyClientStepChange({ inspectionId: "i", fromStatus: "DRAFT" })],
  ["drying", () => notifyClientDryingChange("i")],
] as const;

beforeEach(() => {
  after.mockReset();
  findUnique.mockReset();
});

describe.each(callers)("%s hook and the request lifetime", (_kind, notify) => {
  it("registers work that does not finish until the check has finished", async () => {
    let release!: (value: null) => void;
    findUnique.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const done = notify();

    expect(after).toHaveBeenCalledTimes(1);
    let held = false;
    const hold = Promise.resolve(after.mock.calls[0][0]()).then(() => {
      held = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(held).toBe(false);

    release(null);
    await done;
    await hold;
    expect(held).toBe(true);
  });

  it("still runs and never rejects outside a request scope", async () => {
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    findUnique.mockResolvedValue(null);

    await expect(notify()).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalled();
  });
});
