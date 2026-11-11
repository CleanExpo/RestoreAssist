import { describe, expect, it } from "vitest";
import {
  clarifyingQuestion,
  isNaUtterance,
  parseBareConfirmation,
  parseYesNo,
  routeUtterance,
} from "../router";
import { FIRE_SECTION_IDS } from "../checklist";

/** One clear utterance per section, as a technician might say it on site. */
const CLEAR: Array<[string, string]> = [
  ["site_access", "Fire brigade released the site and the police tape is down, owner met us with the keys"],
  ["safety_brief", "Crew is in P2 respirators, gloves and steel cap boots, safety brief done"],
  ["structure", "Lounge ceiling is sagging and two floor joists are charred, nobody goes in there"],
  ["services", "Power isolated at the switchboard and the gas meter is turned off"],
  ["asbestos_hazmat", "House was built in the 1970s, suspect fibro eaves, possible asbestos in the debris"],
  ["secure_property", "Boarded up the back windows and the side door, temporary fencing out the front"],
  ["water_moisture", "Firefighting water pooled in the hallway, moisture readings high in the subfloor"],
  ["fire_damage", "Kitchen is burnt out, heavy soot through the lounge and a strong smoke odour upstairs"],
  ["contents", "Most furniture is a total loss, clothes in the main bedroom look salvageable"],
  ["evidence", "Took photos and video of every room before we touched anything"],
  ["occupant_insurer", "Spoke to the loss adjuster, claim number given, tenant relocated to accommodation"],
];

describe("routeUtterance", () => {
  it("covers every section with a clear utterance", () => {
    expect(new Set(CLEAR.map(([id]) => id))).toEqual(new Set(FIRE_SECTION_IDS));
  });

  it.each(CLEAR)("files a clear %s utterance with no current section", (sectionId, text) => {
    expect(routeUtterance(text)).toMatchObject({ kind: "file", sectionId });
  });

  it.each(CLEAR)("files a clear %s utterance even while on another section", (sectionId, text) => {
    const elsewhere = FIRE_SECTION_IDS.find((id) => id !== sectionId)!;
    expect(routeUtterance(text, elsewhere)).toMatchObject({ kind: "file", sectionId });
  });

  it("asks about the current section when nothing matches", () => {
    expect(routeUtterance("All good here, moving on", "safety_brief")).toEqual({
      kind: "ask",
      candidateSectionId: "safety_brief",
    });
  });

  it("asks when two sections tie, preferring the current one", () => {
    // "water" hits services and water_moisture equally: never filed on a guess.
    expect(routeUtterance("The water is on", "services")).toEqual({
      kind: "ask",
      candidateSectionId: "services",
    });
    expect(routeUtterance("The water is on", "water_moisture")).toEqual({
      kind: "ask",
      candidateSectionId: "water_moisture",
    });
    expect(routeUtterance("The water is on").kind).toBe("ask");
  });

  it("the current section's lead breaks a one-hit tie but never outvotes a clear winner", () => {
    expect(routeUtterance("roof", "secure_property")).toEqual({
      kind: "ask",
      candidateSectionId: "secure_property",
    });
    expect(
      routeUtterance("Power isolated at the switchboard, gas meter off", "safety_brief"),
    ).toMatchObject({ kind: "file", sectionId: "services" });
  });

  it("treats a not-applicable answer as a proposal to confirm, keeping the words as the reason", () => {
    expect(routeUtterance("Not applicable, there is no gas at this house", "services")).toEqual({
      kind: "confirm_na",
      sectionId: "services",
      reason: "Not applicable, there is no gas at this house",
    });
    expect(routeUtterance("N/A no contents left", "contents")).toMatchObject({ kind: "confirm_na" });
  });

  // Kind K10: a voice utterance never closes a whole section by itself.
  it("never closes a section straight from speech, even when the words carry a hazard", () => {
    const decision = routeUtterance("Gas is not applicable, but the electrical wiring is live and damaged", "services");
    expect(decision.kind).not.toBe("na");
    expect(decision.kind).not.toBe("file");
    expect(decision).toMatchObject({ kind: "confirm_na", sectionId: "services" });
  });

  it("never marks N/A without a current section", () => {
    expect(routeUtterance("not applicable").kind).toBe("ask");
  });

  it("matches whole words only", () => {
    // "gasket" must not count as "gas"; "powered" must not count as "power".
    expect(routeUtterance("gasket powered")).toMatchObject({ kind: "ask" });
  });
});

describe("helpers", () => {
  it("recognises N/A phrasing", () => {
    expect(isNaUtterance("that doesn't apply here")).toBe(true);
    expect(isNaUtterance("nothing to report")).toBe(true);
    expect(isNaUtterance("the gas is off")).toBe(false);
  });

  it("parses yes and no answers", () => {
    expect(parseYesNo("Yes")).toBe("yes");
    expect(parseYesNo("yeah that's right")).toBe("yes");
    expect(parseYesNo("No, it's the structure")).toBe("no");
    expect(parseYesNo("the ceiling is sagging")).toBeNull();
  });

  it("asks in plain words, e.g. is this part of the safety brief", () => {
    expect(clarifyingQuestion("safety_brief")).toBe("Is this part of the safety brief and PPE?");
  });
});

describe("parseBareConfirmation is a yes or no only when nothing else was said", () => {
  it.each([
    ["Yes", "yes"],
    ["yeah that's right", "yes"],
    ["Yes, thanks", "yes"],
    ["No", "no"],
    ["No, thanks.", "no"],
  ])("%s", (text, answer) => {
    expect(parseBareConfirmation(text)).toBe(answer);
  });

  it.each([
    "Yes, and the ceiling is sagging",
    "Yes, and no power at the switchboard",
    "No power at the switchboard",
    "No, it's the structure",
    "Yes but not isolated at the gas meter",
    "the ceiling is sagging",
  ])("%s is not a confirmation, so no word of it can be cut", (text) => {
    expect(parseBareConfirmation(text)).toBeNull();
  });
});
