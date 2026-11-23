/**
 * RA-7694: voice parity. What a technician says becomes the same structured
 * odour, growth and staining observation, always held for confirmation.
 */
import { describe, expect, it } from "vitest";
import { buildConfirmationPrompt, parseTranscript } from "../transcript-parser";

describe("voice room observations", () => {
  it("hears an intermittent musty smell in a room", () => {
    const r = parseTranscript("bathroom, musty smell, comes and goes, moderate");
    expect(r.type).toBe("odour_observation");
    expect(r.parsed).toMatchObject({
      room: "bathroom",
      odourDescriptor: "musty",
      odourPattern: "INTERMITTENT",
      odourIntensity: 2,
      basis: "OBSERVED",
    });
    expect(r.needsConfirmation).toBe(true);
  });

  it("hears a constant, strong odour", () => {
    const r = parseTranscript("laundry odour is constant and strong");
    expect(r.parsed).toMatchObject({ odourPattern: "CONSTANT", odourIntensity: 3 });
  });

  it("hears an explicit intensity number", () => {
    expect(parseTranscript("kitchen sewage smell intensity two").parsed.odourIntensity).toBe(2);
  });

  it("hears visible growth with an area, and marks a suspicion as a hypothesis", () => {
    const r = parseTranscript("bedroom suspected mould growth about 2.5 square metres");
    expect(r.type).toBe("growth_observation");
    expect(r.parsed).toMatchObject({ areaM2: 2.5, basis: "HYPOTHESISED" });
  });

  it("hears staining", () => {
    const r = parseTranscript("hallway ceiling water stain brown");
    expect(r.type).toBe("staining_observation");
  });

  it("holds an observation with no room at low confidence", () => {
    const r = parseTranscript("musty smell intermittent");
    expect(r.type).toBe("odour_observation");
    expect(r.confidence).toBe("low");
    expect(r.parsed.room).toBeUndefined();
  });

  it("never fills a species or a condition", () => {
    const r = parseTranscript("bedroom black mould growth, looks like Stachybotrys, condition 3");
    const keys = Object.keys(r.parsed).join(" ");
    expect(keys).not.toMatch(/species|condition|clearance/i);
  });

  it("leaves existing parsing alone (negative control)", () => {
    expect(parseTranscript("bathroom wall 24 percent").type).toBe("moisture_reading");
    expect(parseTranscript("category two").type).toBe("category_statement");
    expect(parseTranscript("dehumidifier in the lounge").type).toBe("equipment_note");
  });

  it("asks the technician to confirm what it heard", () => {
    const r = parseTranscript("bathroom musty smell intermittent");
    const prompt = buildConfirmationPrompt(r.parsed, r.type, r.confidence);
    expect(prompt).toMatch(/Odour in bathroom: musty, intermittent/);
    expect(prompt).toMatch(/Keep it\?/);
  });
});
