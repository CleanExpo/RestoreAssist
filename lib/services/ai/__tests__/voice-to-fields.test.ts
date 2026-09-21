/**
 * RA-7613 — voice transcripts map onto existing enumerated values only.
 *
 * ANZ material slugs (and their documented aliases), `cat1|cat2|cat3`, and
 * numeric dimensions. A term that does not match is surfaced for
 * confirmation, never guessed.
 */
import { describe, expect, it } from "vitest";
import { mapVoiceTranscriptToFields } from "../voice-to-fields";

describe("RA-7613 — voice transcript fixtures map to exact enum values", () => {
  it("maps gyprock, category 2, and metre dimensions", () => {
    const result = mapVoiceTranscriptToFields(
      "Gyprock in the lounge, category 2, 3.2 metres by 4 metres",
    );
    expect(result.material?.id).toBe("gyprock");
    expect(result.waterCategory).toBe("cat2");
    expect(result.dimensions).toEqual({ lengthM: 3.2, widthM: 4 });
    expect(result.needsConfirmation).toEqual([]);
  });

  it("maps fibro slug and cat3", () => {
    const result = mapVoiceTranscriptToFields("fibro eaves, cat3");
    expect(result.material?.id).toBe("fibro");
    expect(result.waterCategory).toBe("cat3");
    expect(result.needsConfirmation).toEqual([]);
  });

  it("maps a documented material alias without guessing", () => {
    const result = mapVoiceTranscriptToFields("plasterboard walls, CAT_1");
    expect(result.material?.id).toBe("gyprock");
    expect(result.waterCategory).toBe("cat1");
    expect(result.needsConfirmation).toEqual([]);
  });

  it("maps vinyl tiles by alias and a single metre length", () => {
    const result = mapVoiceTranscriptToFields("lino floor, 2.5 m");
    expect(result.material?.id).toBe("vinyl-tiles");
    expect(result.dimensions).toEqual({ lengthM: 2.5 });
    expect(result.needsConfirmation).toEqual([]);
  });

  it("surfaces an unmatched material for confirmation and does not guess a slug", () => {
    const result = mapVoiceTranscriptToFields("The walls are Wonderboard");
    expect(result.material).toBeUndefined();
    expect(result.waterCategory).toBeUndefined();
    expect(result.needsConfirmation).toEqual([
      { kind: "material", term: "Wonderboard" },
    ]);
  });

  it("does not map a near-miss material via substring guessing", () => {
    // "board" is a substring of plasterboard / particleboard — must not match.
    const result = mapVoiceTranscriptToFields("The lining is cement board");
    expect(result.material).toBeUndefined();
    expect(
      result.needsConfirmation.some(
        (item) => item.kind === "material" && /board/i.test(item.term),
      ),
    ).toBe(true);
  });
});
