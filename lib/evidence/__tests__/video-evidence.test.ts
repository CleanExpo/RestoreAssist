import { describe, expect, it } from "vitest";
import { isVideoEvidenceClass } from "../evidence-classes";
import { VIDEO_EVIDENCE_ACCEPT } from "../ios-capture";

describe("video evidence helpers", () => {
  it("treats only VIDEO_WALKTHROUGH as video", () => {
    expect(isVideoEvidenceClass("VIDEO_WALKTHROUGH")).toBe(true);
    expect(isVideoEvidenceClass("PHOTO_DAMAGE")).toBe(false);
    expect(isVideoEvidenceClass("SITE_OVERVIEW")).toBe(false);
  });

  it("video picker accepts only video, so phones open the camera in video mode", () => {
    const types = VIDEO_EVIDENCE_ACCEPT.split(",");
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) expect(t.startsWith("video/")).toBe(true);
  });
});
