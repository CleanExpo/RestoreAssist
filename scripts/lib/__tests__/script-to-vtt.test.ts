import { describe, it, expect } from "vitest";
import { segmentsToVtt } from "../script-to-vtt";

describe("segmentsToVtt", () => {
  it("emits a valid WEBVTT document with mm:ss.mmm cues", () => {
    const vtt = segmentsToVtt([
      { text: "Hello there.", startSec: 0.5, durationSec: 4.5 },
      { text: "Second line.", startSec: 6.5, durationSec: 6.5 },
    ]);
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    expect(vtt).toContain("00:00.500 --> 00:05.000");
    expect(vtt).toContain("Hello there.");
    expect(vtt).toContain("00:06.500 --> 00:13.000");
    expect(vtt).toContain("Second line.");
  });
});
