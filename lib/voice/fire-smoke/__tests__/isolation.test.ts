import { describe, expect, it } from "vitest";
import { parseTranscript } from "@/lib/voice/transcript-parser";
import { ALL_FIRE_OBSERVATION_TYPES } from "../schema";

/**
 * Only the fire route writes fire_* observation types (spec §0 R9). The
 * water-damage parser behind the existing observation route must never
 * produce one, whatever the technician says.
 */
const UTTERANCES = [
  "fire_section_entry",
  "fire_walkthrough_signoff",
  "Sign off the fire walkthrough",
  "Safety brief done, crew in P2 respirators",
  "Kitchen is burnt out, heavy soot",
  "Mark services not applicable",
  "Moisture reading 28 percent in the lounge",
];

describe("fire observation types stay with the fire route", () => {
  it.each(UTTERANCES)("parseTranscript(%s) never returns a fire_ type", (text) => {
    const result = parseTranscript(text);
    expect(result.type.startsWith("fire_")).toBe(false);
    expect(ALL_FIRE_OBSERVATION_TYPES).not.toContain(result.type);
  });
});
