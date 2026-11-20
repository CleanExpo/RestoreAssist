/**
 * RA-8388 / amendment 01 A1+A2 — the canonical metadata payload.
 *
 * The defect this module exists to prevent: the client signs one shape and the
 * server persists another, so `checkManifestBinding` reports "file may have
 * been altered after signing" on a submission nobody altered. That happened
 * three ways at once on the old design — the wire field is `notes` while the
 * column is `description`, a blank title becomes the class name server-side,
 * and EQUIPMENT_LOG sends neither field so one side canonicalises an absent
 * key while the other canonicalises an explicit null.
 *
 * The design answer is that there is exactly ONE normaliser, both sides call
 * it, and it emits every key explicitly. These tests are written against that
 * contract, not against an implementation.
 */
import { describe, expect, it } from "vitest";

import {
  canonicalMetadataPayload,
  canonicalMetadataPayloadBytes,
  metadataPayloadSha256,
  METADATA_PAYLOAD_VERSION,
} from "../metadata-payload";

const MOISTURE = {
  evidenceClass: "MOISTURE_READING",
  title: "Living room south wall",
  notes: "Pin meter, 150mm",
  structuredData: { measurementValue: 18.4, measurementUnit: "%" },
};

describe("canonicalMetadataPayload — normalisation has one owner", () => {
  it("renames the wire field `notes` to the persisted name `description`", () => {
    const payload = canonicalMetadataPayload(MOISTURE);
    expect(payload.description).toBe("Pin meter, 150mm");
    expect(payload).not.toHaveProperty("notes");
  });

  it("falls back to the evidence class when the title is blank, as the route does", () => {
    // app/api/inspections/[id]/evidence/route.ts:219-223 does exactly this.
    // If the client does not apply the same rule before signing, every
    // untitled capture fails binding.
    expect(canonicalMetadataPayload({ ...MOISTURE, title: "   " }).title).toBe(
      "MOISTURE_READING",
    );
    expect(canonicalMetadataPayload({ ...MOISTURE, title: undefined }).title).toBe(
      "MOISTURE_READING",
    );
  });

  it("trims a real title rather than dropping it", () => {
    expect(canonicalMetadataPayload({ ...MOISTURE, title: "  Kitchen  " }).title).toBe(
      "Kitchen",
    );
  });

  it("turns an empty note into null, matching the column", () => {
    expect(canonicalMetadataPayload({ ...MOISTURE, notes: "" }).description).toBeNull();
  });

  it("carries the payload version inside the payload, so a stored signature stays re-verifiable", () => {
    expect(canonicalMetadataPayload(MOISTURE).payloadVersion).toBe(
      METADATA_PAYLOAD_VERSION,
    );
    expect(canonicalMetadataPayloadBytes(MOISTURE)).toContain('"payloadVersion"');
  });
});

describe("canonicalMetadataPayloadBytes — both sides must produce identical bytes", () => {
  it("is independent of key order in the input", () => {
    const reordered = {
      structuredData: { measurementUnit: "%", measurementValue: 18.4 },
      notes: "Pin meter, 150mm",
      title: "Living room south wall",
      evidenceClass: "MOISTURE_READING",
    };
    expect(canonicalMetadataPayloadBytes(reordered)).toBe(
      canonicalMetadataPayloadBytes(MOISTURE),
    );
  });

  it("treats an absent key and an explicit undefined as the same payload", () => {
    // EQUIPMENT_LOG sends neither `notes` nor `structuredData`
    // (capture/page.tsx:553-574). The canonicaliser drops undefined keys
    // (manifest-canonical.ts:60-62) while the server writes null, so unless
    // this module emits every key explicitly the two sides diverge and the
    // one class with no payload fails on every single attempt.
    const absent = { evidenceClass: "EQUIPMENT_LOG", title: "Dehumidifier 1" };
    const explicit = {
      evidenceClass: "EQUIPMENT_LOG",
      title: "Dehumidifier 1",
      notes: undefined,
      structuredData: undefined,
    };
    expect(canonicalMetadataPayloadBytes(absent)).toBe(
      canonicalMetadataPayloadBytes(explicit),
    );
  });

  it("emits description and structuredData as explicit nulls, never as missing keys", () => {
    const bytes = canonicalMetadataPayloadBytes({
      evidenceClass: "EQUIPMENT_LOG",
      title: "Dehumidifier 1",
    });
    expect(bytes).toContain('"description":null');
    expect(bytes).toContain('"structuredData":null');
  });

  it("refuses a payload that cannot canonicalise deterministically", () => {
    expect(() =>
      canonicalMetadataPayloadBytes({
        ...MOISTURE,
        structuredData: { measurementValue: Number.NaN },
      }),
    ).toThrow();
  });
});

describe("metadataPayloadSha256 — the binding digest", () => {
  it("is a 64-character lowercase hex digest", async () => {
    const digest = await metadataPayloadSha256(MOISTURE);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same payload", async () => {
    expect(await metadataPayloadSha256(MOISTURE)).toBe(
      await metadataPayloadSha256({ ...MOISTURE }),
    );
  });

  it("changes when the measured value changes", async () => {
    // The whole point of binding: a reading altered after signing must not
    // verify. 18.4 to 2.0 is the difference between a wet wall and a dry one.
    const tampered = {
      ...MOISTURE,
      structuredData: { measurementValue: 2.0, measurementUnit: "%" },
    };
    expect(await metadataPayloadSha256(tampered)).not.toBe(
      await metadataPayloadSha256(MOISTURE),
    );
  });

  it("changes when the title or note changes", async () => {
    const base = await metadataPayloadSha256(MOISTURE);
    expect(await metadataPayloadSha256({ ...MOISTURE, title: "Other wall" })).not.toBe(
      base,
    );
    expect(await metadataPayloadSha256({ ...MOISTURE, notes: "Pinless" })).not.toBe(
      base,
    );
  });

  it("differs between evidence classes carrying identical content", async () => {
    expect(
      await metadataPayloadSha256({ ...MOISTURE, evidenceClass: "TECHNICIAN_NOTE" }),
    ).not.toBe(await metadataPayloadSha256(MOISTURE));
  });

  it("agrees when the server normalises the same wire body the client signed", async () => {
    // The client signs what it is about to send; the server recomputes from
    // what it received. Same module, same bytes, by construction.
    const wireBody = {
      evidenceClass: "MOISTURE_READING",
      title: "",
      notes: "Pin meter, 150mm",
      structuredData: { measurementUnit: "%", measurementValue: 18.4 },
    };
    const clientDigest = await metadataPayloadSha256(wireBody);
    const serverDigest = await metadataPayloadSha256({
      evidenceClass: wireBody.evidenceClass,
      title: wireBody.title,
      notes: wireBody.notes,
      structuredData: wireBody.structuredData,
    });
    expect(serverDigest).toBe(clientDigest);
  });
});
