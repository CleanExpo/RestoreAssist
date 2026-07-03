import { describe, it, expect } from "vitest";
import {
  evaluateUnderlayAttestation,
  buildUnderlayAttestationRecord,
  UNDERLAY_ATTESTATION_VERSION,
  UNDERLAY_RIGHTS_STATEMENT,
} from "../underlay-attestation";

// RA-6848 [C2] / RA-6849 [C3]: an imported plan can never be applied unless the
// operator affirms BOTH rights + source-ToS compliance. This gate is the shared
// enforcement point for the URL and upload paths.
describe("evaluateUnderlayAttestation", () => {
  it("passes only when both affirmations are true", () => {
    expect(
      evaluateUnderlayAttestation({
        holdsRights: true,
        compliesWithSourceTerms: true,
      }),
    ).toEqual({ ok: true });
  });

  it("fails on missing rights and names that reason first", () => {
    const r = evaluateUnderlayAttestation({
      holdsRights: false,
      compliesWithSourceTerms: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/rights/i);
  });

  it("fails on missing source-terms affirmation", () => {
    const r = evaluateUnderlayAttestation({
      holdsRights: true,
      compliesWithSourceTerms: false,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/terms of use/i);
  });

  it("reports the rights reason first when both are missing", () => {
    const r = evaluateUnderlayAttestation({
      holdsRights: false,
      compliesWithSourceTerms: false,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/rights/i);
  });
});

describe("buildUnderlayAttestationRecord", () => {
  it("builds a versioned, timestamped record for a complete attestation", () => {
    const fixed = new Date("2026-07-04T01:23:45.000Z");
    const record = buildUnderlayAttestationRecord(
      { holdsRights: true, compliesWithSourceTerms: true },
      "url",
      () => fixed,
    );
    expect(record).toEqual({
      version: UNDERLAY_ATTESTATION_VERSION,
      statement: UNDERLAY_RIGHTS_STATEMENT,
      source: "url",
      holdsRights: true,
      compliesWithSourceTerms: true,
      attestedAt: "2026-07-04T01:23:45.000Z",
    });
  });

  it("carries the upload source through", () => {
    const record = buildUnderlayAttestationRecord(
      { holdsRights: true, compliesWithSourceTerms: true },
      "upload",
    );
    expect(record.source).toBe("upload");
  });

  it("throws rather than record an incomplete attestation", () => {
    expect(() =>
      buildUnderlayAttestationRecord(
        { holdsRights: true, compliesWithSourceTerms: false },
        "url",
      ),
    ).toThrow(/terms of use/i);
  });
});
