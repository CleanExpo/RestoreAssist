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
    "asbestos free ceramic tiles",
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

const ACM_CUE_WORDS = ["vinyl", "lino", "linoleum", "asbestos", "fibro"] as const;

/** Firm forms cancel one occurrence. Hedged forms are doubt and must be asked. */
const CUE_NEGATION_FORMS: Array<{
  id: string;
  hedge: boolean;
  apply: (cue: string) => string;
}> = [
  { id: "not", hedge: false, apply: (cue) => `not ${cue}` },
  { id: "no", hedge: false, apply: (cue) => `no ${cue}` },
  { id: "non", hedge: false, apply: (cue) => `non-${cue}` },
  { id: "free", hedge: false, apply: (cue) => `${cue}-free` },
  { id: "probably-not", hedge: true, apply: (cue) => `probably not ${cue}` },
  { id: "maybe-not", hedge: true, apply: (cue) => `maybe not ${cue}` },
  { id: "likely-not", hedge: true, apply: (cue) => `likely not ${cue}` },
  { id: "possibly-not", hedge: true, apply: (cue) => `possibly not ${cue}` },
  { id: "not-i-think", hedge: true, apply: (cue) => `not ${cue} I think` },
  { id: "not-i-reckon", hedge: true, apply: (cue) => `not ${cue} I reckon` },
  { id: "not-comma-i-think", hedge: true, apply: (cue) => `not ${cue}, I think` },
  { id: "not-comma-i-reckon", hedge: true, apply: (cue) => `not ${cue}, I reckon` },
  { id: "not-i-dont-think", hedge: true, apply: (cue) => `not ${cue} I don't think` },
  {
    id: "not-comma-i-dont-think",
    hedge: true,
    apply: (cue) => `not ${cue}, I don't think`,
  },
  { id: "hopefully-no", hedge: true, apply: (cue) => `hopefully no ${cue}` },
  { id: "dont-think", hedge: true, apply: (cue) => `I don't think ${cue}` },
];

function confirmationNames(term: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, "i").test(term);
}

/**
 * A surviving cue must surface as an asbestos-possible material, or as a
 * confirmation that names that word. A non-ACM material with nothing to
 * confirm is a silent miss.
 */
function honoursSurvivingCue(
  result: ReturnType<typeof mapVoiceTranscriptToFields>,
  word: string,
): boolean {
  const named = result.needsConfirmation.some(
    (item) => item.kind === "material" && confirmationNames(item.term, word),
  );
  const acm = result.material?.isPotentialAcm === true;
  const silentNonAcm =
    result.material != null &&
    result.material.isPotentialAcm === false &&
    result.needsConfirmation.length === 0;
  return !silentNonAcm && (acm || named);
}

describe("RA-7638 — a bare cue anywhere in the note still counts", () => {
  const generated = ACM_CUE_WORDS.flatMap((negated) =>
    CUE_NEGATION_FORMS.flatMap((form) =>
      ACM_CUE_WORDS.map((bare) => ({
        phrase: `ceramic tiles ${form.apply(negated)}, ${bare} in the laundry`,
        bare,
        form: form.id,
      })),
    ),
  );

  it.each(generated)(
    "$phrase does not hide bare '$bare'",
    ({ phrase, bare }) => {
      const result = mapVoiceTranscriptToFields(phrase);
      expect(honoursSurvivingCue(result, bare)).toBe(true);
    },
  );

  const hedged = CUE_NEGATION_FORMS.filter((form) => form.hedge).flatMap(
    (form) =>
      ACM_CUE_WORDS.map((cue) => ({
        phrase: `tiles ${form.apply(cue)}`,
        cue,
        form: form.id,
      })),
  );

  it.each(hedged)(
    "$phrase asks because '$form' is doubt",
    ({ phrase, cue }) => {
      const result = mapVoiceTranscriptToFields(phrase);
      const named = result.needsConfirmation.some(
        (item) =>
          item.kind === "material" && confirmationNames(item.term, cue),
      );
      expect(named).toBe(true);
      expect(result.material?.isPotentialAcm === false).toBe(false);
    },
  );

  it.each([
    ["non-asbestos ceramic tiles, vinyl underneath", "vinyl"],
    ["tiles no asbestos, vinyl underneath", "vinyl"],
    ["ceramic tiles not vinyl, old vinyl in the laundry", "vinyl"],
    ["ceramic tiles not vinyl, asbestos in the eaves", "asbestos"],
    ["ceramic tiles not vinyl. Vinyl sheet in laundry.", "vinyl"],
    ["vinyl-look ceramic tiles, vinyl in laundry", "vinyl"],
    ["tiles probably not vinyl", "vinyl"],
    ["tiles maybe not vinyl", "vinyl"],
    ["tiles likely not vinyl", "vinyl"],
    ["tiles possibly not vinyl", "vinyl"],
    ["tiles not vinyl, I think", "vinyl"],
    ["tiles not vinyl I reckon", "vinyl"],
    ["tiles vinyl free from water damage", "vinyl"],
    ["ceramic tiles, vinyl free from cracks in laundry", "vinyl"],
    ["tiles vinyl free-floating", "vinyl"],
    ["tiles non-vinyl I think", "vinyl"],
    ["tiles no vinyl, I reckon", "vinyl"],
    ["no asbestos I think", "asbestos"],
    ["ceramic tiles, vinyl free-lay sheet in laundry", "vinyl"],
    ["ceramic tiles in kitchen, vinyl free floating floor in laundry", "vinyl"],
  ] as const)(
    "named case '%s' honours surviving '%s'",
    (phrase, word) => {
      const result = mapVoiceTranscriptToFields(phrase);
      expect(honoursSurvivingCue(result, word)).toBe(true);
      const mustAsk =
        phrase === "tiles probably not vinyl" ||
        phrase === "tiles maybe not vinyl" ||
        phrase === "tiles likely not vinyl" ||
        phrase === "tiles possibly not vinyl" ||
        phrase === "tiles not vinyl, I think" ||
        phrase === "tiles not vinyl I reckon" ||
        phrase === "tiles non-vinyl I think" ||
        phrase === "tiles no vinyl, I reckon" ||
        phrase === "no asbestos I think" ||
        phrase === "ceramic tiles, vinyl free-lay sheet in laundry" ||
        phrase ===
          "ceramic tiles in kitchen, vinyl free floating floor in laundry";
      if (mustAsk) {
        const named = result.needsConfirmation.some(
          (item) =>
            item.kind === "material" && confirmationNames(item.term, word),
        );
        expect(named).toBe(true);
      }
    },
  );
});

/**
 * "free" cancels only as "<cue>-free" or "<cue> free" plus a material or tile
 * word, or the end of the clause. free-floating, free floating, free-lay,
 * free-standing, free of, and free from leave the cue in play.
 */
const CUE_FREE_FORMS = [
  "free-floating",
  "free floating",
  "free-lay",
  "free-standing",
  "free of",
  "free from",
] as const;

const CUE_CLAUSE_NEGATIONS: Array<{
  id: string;
  apply: (cue: string) => string;
}> = [
  { id: "not", apply: (cue) => `not ${cue}` },
  { id: "no", apply: (cue) => `no ${cue}` },
  { id: "non", apply: (cue) => `non-${cue}` },
  { id: "without", apply: (cue) => `without ${cue}` },
];

/** Trailing hedges, with and without a comma, and later in the same clause. */
const CUE_TRAILING_HEDGES = [
  "I think",
  "I reckon",
  "I don't think",
  "I'm not sure",
] as const;

const CUE_HEDGE_PLACEMENTS: Array<{
  id: string;
  apply: (negated: string, hedge: string) => string;
}> = [
  { id: "adjacent", apply: (negated, hedge) => `${negated} ${hedge}` },
  { id: "comma", apply: (negated, hedge) => `${negated}, ${hedge}` },
  {
    id: "later",
    apply: (negated, hedge) => `${negated} in the laundry, ${hedge}`,
  },
];

describe("RA-7638 — free and a trailing hedge do not cancel a cue", () => {
  const freeDimension = ACM_CUE_WORDS.flatMap((cue) =>
    CUE_FREE_FORMS.map((form) => ({
      phrase: `tiles ${cue} ${form}`,
      cue,
      form,
    })),
  );

  it.each(freeDimension)(
    "$phrase keeps '$cue' ($form does not cancel)",
    ({ phrase, cue }) => {
      const result = mapVoiceTranscriptToFields(phrase);
      expect(honoursSurvivingCue(result, cue)).toBe(true);
    },
  );

  const hedgedNegation = ACM_CUE_WORDS.flatMap((cue) =>
    CUE_CLAUSE_NEGATIONS.flatMap((negation) =>
      CUE_TRAILING_HEDGES.flatMap((hedge) =>
        CUE_HEDGE_PLACEMENTS.map((placement) => ({
          phrase: `tiles ${placement.apply(negation.apply(cue), hedge)}`,
          cue,
          negation: negation.id,
          hedge,
          placement: placement.id,
        })),
      ),
    ),
  );

  it.each(hedgedNegation)(
    "$phrase asks ($negation + $hedge, $placement)",
    ({ phrase, cue }) => {
      const result = mapVoiceTranscriptToFields(phrase);
      const named = result.needsConfirmation.some(
        (item) =>
          item.kind === "material" && confirmationNames(item.term, cue),
      );
      expect(named).toBe(true);
      expect(result.material?.isPotentialAcm === false).toBe(false);
    },
  );
});
