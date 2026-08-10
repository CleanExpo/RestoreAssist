import { describe, expect, it } from "vitest";
import {
  derivePlanLifecyclePhase,
  shouldDefaultToQuickEdit,
} from "../plan-lifecycle";

const base = {
  startDismissed: false,
  scanning: false,
  hasPlanGeometry: false,
  hasUnderlayOnly: false,
  hasUnconfirmedRooms: false,
};

describe("plan-lifecycle", () => {
  it("starts empty when chooser is visible", () => {
    expect(derivePlanLifecyclePhase(base)).toBe("empty");
  });

  it("is waiting after dismiss with no geometry", () => {
    expect(
      derivePlanLifecyclePhase({ ...base, startDismissed: true }),
    ).toBe("waiting");
  });

  it("scanning wins over other signals", () => {
    expect(
      derivePlanLifecyclePhase({
        ...base,
        scanning: true,
        hasPlanGeometry: true,
      }),
    ).toBe("scanning");
  });

  it("underlay-only is waiting", () => {
    expect(
      derivePlanLifecyclePhase({
        ...base,
        startDismissed: true,
        hasUnderlayOnly: true,
      }),
    ).toBe("waiting");
  });

  it("unconfirmed rooms need confirm", () => {
    expect(
      derivePlanLifecyclePhase({
        ...base,
        hasPlanGeometry: true,
        hasUnconfirmedRooms: true,
      }),
    ).toBe("needs_confirm");
  });

  it("ack skips needs_confirm", () => {
    expect(
      derivePlanLifecyclePhase({
        ...base,
        hasPlanGeometry: true,
        hasUnconfirmedRooms: true,
        planReadyAck: true,
      }),
    ).toBe("plan_ready");
  });

  it("confirmed geometry is plan_ready", () => {
    expect(
      derivePlanLifecyclePhase({
        ...base,
        hasPlanGeometry: true,
        hasUnconfirmedRooms: false,
      }),
    ).toBe("plan_ready");
  });

  it("defaults to quick edit on confirm/ready phases", () => {
    expect(shouldDefaultToQuickEdit("needs_confirm")).toBe(true);
    expect(shouldDefaultToQuickEdit("plan_ready")).toBe(true);
    expect(shouldDefaultToQuickEdit("empty")).toBe(false);
    expect(shouldDefaultToQuickEdit("waiting")).toBe(false);
  });
});
