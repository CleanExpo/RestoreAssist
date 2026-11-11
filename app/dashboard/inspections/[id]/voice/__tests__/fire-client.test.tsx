import { describe, expect, it } from "vitest";
import { createKeyRing } from "../_fire/fire-client";
import type { FireAction } from "@/lib/voice/fire-smoke/schema";

const capture = (transcript: string): FireAction =>
  ({ action: "capture", sessionId: "vs-1", transcript, currentSectionId: "services" }) as FireAction;

describe("createKeyRing (kind K12: each unconfirmed save keeps its own key)", () => {
  it("retrying an unconfirmed save reuses its key after another answer was sent in between", () => {
    const keys = createKeyRing();
    const first = keys.keyFor(capture("Gas meter is off"));
    const other = keys.keyFor(capture("Power isolated at the board"));
    expect(other).not.toBe(first);
    expect(keys.keyFor(capture("Gas meter is off"))).toBe(first);
  });

  it("settling one save releases only that save's key", () => {
    const keys = createKeyRing();
    const a = keys.keyFor(capture("Gas meter is off"));
    const b = keys.keyFor(capture("Power isolated at the board"));
    keys.settle(capture("Gas meter is off"));
    expect(keys.keyFor(capture("Gas meter is off"))).not.toBe(a);
    expect(keys.keyFor(capture("Power isolated at the board"))).toBe(b);
  });
});
