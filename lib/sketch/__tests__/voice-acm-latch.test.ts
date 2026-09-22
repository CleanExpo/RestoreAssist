/**
 * Undo reloads an earlier canvas snapshot. Once a voice note has raised the
 * asbestos latch, that undo (and a later redo) must not clear voiceRaisedAcm.
 */
import { describe, expect, it } from "vitest";
import {
  raiseVoiceAcmLatch,
  reapplyVoiceAcmLatch,
  type LatchObject,
} from "../voice-acm-latch";

describe("voice ACM latch survives undo and redo", () => {
  it("accepts vinyl tiles, undoes, and the saved sketch still has voiceRaisedAcm true", () => {
    const before: LatchObject[] = [{ data: { id: "room-a", type: "room" } }];
    const history: LatchObject[][] = [structuredClone(before)];
    let raised = new Set<string>();

    const recorded = structuredClone(before);
    raised = raiseVoiceAcmLatch(recorded, "room-a", raised);
    history.push(structuredClone(recorded));
    expect(recorded[0]?.data?.voiceRaisedAcm).toBe(true);

    const undone = structuredClone(history[0]);
    reapplyVoiceAcmLatch(undone, raised);
    expect(undone[0]?.data?.voiceRaisedAcm).toBe(true);

    const redone = structuredClone(history[1]);
    delete redone[0]?.data?.voiceRaisedAcm;
    reapplyVoiceAcmLatch(redone, raised);
    expect(redone[0]?.data?.voiceRaisedAcm).toBe(true);
  });
});
