/**
 * RA-7623 — accepting a voice suggestion writes enumerated room fields.
 * The snapshot is unchanged until accept. An ACM material raises the WHS
 * gate and a later non-ACM accept does not clear that latch.
 */
import { describe, expect, it } from "vitest";
import { mapVoiceTranscriptToFields } from "../voice-to-fields";
import {
  acceptVoiceSuggestion,
  rejectVoiceSuggestion,
  suggestionsFromMapping,
  type VoiceJobSnapshot,
  type VoiceSuggestion,
} from "../voice-field-suggestions";

const FIXTURE = "Living room 4 x 3.2 metres, vinyl tiles, category 2";

function byKind<K extends VoiceSuggestion["kind"]>(
  suggestions: VoiceSuggestion[],
  kind: K,
): Extract<VoiceSuggestion, { kind: K }> {
  const found = suggestions.find((item) => item.kind === kind);
  if (!found || found.kind !== kind) {
    throw new Error(`missing ${kind} suggestion`);
  }
  return found as Extract<VoiceSuggestion, { kind: K }>;
}

describe("voice field suggestions", () => {
  it("leaves the job unchanged before Accept, then writes vinyl-tiles, cat2 and 4 x 3.2 m", () => {
    const job: VoiceJobSnapshot = {};
    const suggestions = suggestionsFromMapping(
      mapVoiceTranscriptToFields(FIXTURE),
    );
    expect(job).toEqual({});
    expect(byKind(suggestions, "material").material.id).toBe("vinyl-tiles");
    expect(byKind(suggestions, "waterCategory").waterCategory).toBe("cat2");
    expect(byKind(suggestions, "dimensions")).toMatchObject({
      lengthM: 4,
      widthM: 3.2,
    });

    const withMaterial = acceptVoiceSuggestion(
      job,
      byKind(suggestions, "material"),
      1988,
    );
    const withCategory = acceptVoiceSuggestion(
      withMaterial.job,
      byKind(suggestions, "waterCategory"),
      1988,
    );
    const withSize = acceptVoiceSuggestion(
      withCategory.job,
      byKind(suggestions, "dimensions"),
      1988,
    );

    expect(withSize.job.materialSlug).toBe("vinyl-tiles");
    expect(withSize.job.waterCategory).toBe("cat2");
    expect(withSize.job.lengthM).toBe(4);
    expect(withSize.job.widthM).toBe(3.2);
    expect(rejectVoiceSuggestion(job)).toEqual({});
  });

  it("raises the WHS gate for vinyl tiles and keeps it after a non-ACM accept", () => {
    const vinyl = byKind(
      suggestionsFromMapping(mapVoiceTranscriptToFields(FIXTURE)),
      "material",
    );
    const raised = acceptVoiceSuggestion({}, vinyl, 1988);
    expect(raised.job.voiceRaisedAcm).toBe(true);
    expect(raised.whs?.suspectedAcm).toBe(true);
    expect(raised.whs?.blocked).toBe(true);

    const gyprock = byKind(
      suggestionsFromMapping(mapVoiceTranscriptToFields("gyprock walls")),
      "material",
    );
    const later = acceptVoiceSuggestion(raised.job, gyprock, 1988);
    expect(later.job.materialSlug).toBe("gyprock");
    expect(later.job.voiceRaisedAcm).toBe(true);
    expect(later.whs?.blocked).toBe(true);
    expect(later.whs?.suspectedAcm).toBe(true);
  });

  it("shows an unmatched word and does not guess a slug", () => {
    const suggestions = suggestionsFromMapping(
      mapVoiceTranscriptToFields("walls are wonderboard"),
    );
    expect(suggestions).toEqual([
      { kind: "unrecognised", term: "wonderboard" },
    ]);
    const accepted = acceptVoiceSuggestion({}, suggestions[0], 1988);
    expect(accepted.job.materialSlug).toBeUndefined();
    expect(accepted.job.voiceRaisedAcm).toBeUndefined();
    expect(accepted.whs).toBeNull();
  });
});
