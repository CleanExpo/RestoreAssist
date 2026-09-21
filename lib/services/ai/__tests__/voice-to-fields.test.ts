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

describe("RA-7620 — vinyl-tiles plural and water-category confirmation", () => {
  it("maps 'vinyl tiles' to vinyl-tiles (ACM) or surfaces confirmation, never ceramic-tile", () => {
    const result = mapVoiceTranscriptToFields("vinyl tiles");
    const confirmedMaterial = result.needsConfirmation.some(
      (item) => item.kind === "material",
    );
    expect(result.material?.id).not.toBe("ceramic-tile");
    expect(
      result.material?.id === "vinyl-tiles" || confirmedMaterial,
    ).toBe(true);
    if (result.material?.id === "vinyl-tiles") {
      expect(result.material.isPotentialAcm).toBe(true);
    }
  });

  it("never yields cat1 from a negated category 1 corrected to category 3", () => {
    const result = mapVoiceTranscriptToFields(
      "not category 1, this is category 3",
    );
    expect(result.waterCategory).not.toBe("cat1");
  });

  it("does not auto-pick a category when two categories are named, and surfaces confirmation", () => {
    const result = mapVoiceTranscriptToFields(
      "could be category 2 or category 3",
    );
    expect(result.waterCategory).toBeUndefined();
    expect(
      result.needsConfirmation.some((item) => item.kind === "waterCategory"),
    ).toBe(true);
  });

  it.each([
    "vinyl floor tiles",
    "vinyl lino tiles",
    "old vinyl kitchen floor tiles",
  ])(
    "maps '%s' to vinyl-tiles or confirmation, never ceramic-tile",
    (transcript) => {
      const result = mapVoiceTranscriptToFields(transcript);
      const confirmedMaterial = result.needsConfirmation.some(
        (item) => item.kind === "material",
      );
      expect(result.material?.id).not.toBe("ceramic-tile");
      expect(
        result.material?.id === "vinyl-tiles" || confirmedMaterial,
      ).toBe(true);
      if (result.material?.id === "vinyl-tiles") {
        expect(result.material.isPotentialAcm).toBe(true);
      }
    },
  );

  it("maps 'ceramic tiles' to ceramic-tile", () => {
    const result = mapVoiceTranscriptToFields("ceramic tiles");
    expect(result.material?.id).toBe("ceramic-tile");
    expect(result.material?.isPotentialAcm).toBe(false);
  });

  it("maps spoken-word 'category three' to cat3", () => {
    const result = mapVoiceTranscriptToFields("category three black water");
    expect(result.waterCategory).toBe("cat3");
  });

  it("does not flag a water category phrase as an unknown material", () => {
    const result = mapVoiceTranscriptToFields("this is category 3");
    expect(result.waterCategory).toBe("cat3");
    expect(
      result.needsConfirmation.some((item) => item.kind === "material"),
    ).toBe(false);
  });
});

describe("RA-7638 — explicit ceramic is not silently remapped by an ACM cue", () => {
  it("maps bare 'tiles' to ceramic-tile", () => {
    const result = mapVoiceTranscriptToFields("tiles");
    expect(result.material?.id).toBe("ceramic-tile");
    expect(result.material?.isPotentialAcm).toBe(false);
    expect(result.needsConfirmation).toEqual([]);
  });

  it("maps a vinyl-tiles clause with category and dimensions", () => {
    const result = mapVoiceTranscriptToFields(
      "Living room 4 x 3.2 metres, vinyl tiles, category 2",
    );
    expect(result.material?.id).toBe("vinyl-tiles");
    expect(result.material?.isPotentialAcm).toBe(true);
    expect(result.waterCategory).toBe("cat2");
    expect(result.dimensions).toEqual({ lengthM: 4, widthM: 3.2 });
    expect(result.needsConfirmation).toEqual([]);
  });

  it.each([
    "ceramic tiles not vinyl",
    "non-asbestos ceramic tiles",
    "no asbestos in the ceramic tiles",
    "asbestos-free ceramic tiles",
    "vinyl-look ceramic tiles",
    "vinyl-style ceramic tiles",
    "vinyl-effect ceramic tiles",
  ])("keeps ceramic-tile for '%s'", (transcript) => {
    const result = mapVoiceTranscriptToFields(transcript);
    expect(result.material?.id).toBe("ceramic-tile");
    expect(result.material?.isPotentialAcm).toBe(false);
    expect(result.needsConfirmation).toEqual([]);
  });

  it("asks for confirmation naming both when ceramic sits beside an ACM cue", () => {
    const result = mapVoiceTranscriptToFields("ceramic tiles over old lino");
    expect(result.material).toBeUndefined();
    expect(result.needsConfirmation).toEqual([
      { kind: "material", term: "ceramic tiles over old lino" },
    ]);
  });
});

describe("RA-7638 — a cancelled cue must not hide another asbestos word", () => {
  it.each([
    ["non-asbestos ceramic tiles, fibro eaves", /ceramic/i, /fibro/i],
    ["tiles not vinyl, lino", /tiles/i, /lino/i],
    ["tiles not vinyl, fibro", /tiles/i, /fibro/i],
    ["ceramic tiles not vinyl. Laundry is lino.", /ceramic/i, /lino/i],
    ["floor tiles vinyl look old", /tiles/i, /vinyl/i],
    ["vinyl look ceramic tiles", /ceramic/i, /vinyl/i],
    ["tiles whether or not vinyl", /tiles/i, /vinyl/i],
    ["tiles not sure if vinyl", /tiles/i, /vinyl/i],
    ["ceramic tiles not vinyl?", /ceramic/i, /vinyl/i],
  ])(
    "asks, and does not guess, for '%s'",
    (transcript, left, right) => {
      const result = mapVoiceTranscriptToFields(transcript);
      expect(result.material).toBeUndefined();
      const term = result.needsConfirmation
        .filter((item) => item.kind === "material")
        .map((item) => item.term)
        .join(" ");
      expect(term).toMatch(left);
      expect(term).toMatch(right);
    },
  );
});
