/**
 * RA-7090 slice 1: evidence hash must cover the uploaded BYTES,
 * not the Data URL text the camera plugin returns.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

const getPhoto = vi.fn();
vi.mock("@capacitor/camera", () => ({
  Camera: { getPhoto: (...args: unknown[]) => getPhoto(...args) },
  CameraResultType: { DataUrl: "dataUrl" },
  CameraSource: { Camera: "CAMERA" },
}));
vi.mock("@/lib/capacitor", () => ({
  getCurrentLocation: vi.fn(async () => ({
    latitude: -33.8688,
    longitude: 151.2093,
  })),
}));

import {
  buildEvidenceFormData,
  captureEvidencePhoto,
  evidenceIdempotencyKey,
  sha256Bytes,
} from "../ios-capture";

// Known fixture: ASCII bytes "hello world"
// SHA-256("hello world") — standard test vector.
const FIXTURE_BYTES = new TextEncoder().encode("hello world");
const FIXTURE_B64 = Buffer.from(FIXTURE_BYTES).toString("base64");
const FIXTURE_DATA_URL = `data:image/jpeg;base64,${FIXTURE_B64}`;
const EXPECTED_SHA256 =
  "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

beforeEach(() => {
  getPhoto.mockReset();
  getPhoto.mockResolvedValue({ dataUrl: FIXTURE_DATA_URL, format: "jpeg" });
});

describe("sha256Bytes", () => {
  it("computes the standard SHA-256 over raw bytes", async () => {
    const buf = FIXTURE_BYTES.slice().buffer;
    await expect(sha256Bytes(buf)).resolves.toBe(EXPECTED_SHA256);
  });
});

describe("captureEvidencePhoto", () => {
  it("hashes the captured blob bytes, matching a server-side hash over the same bytes", async () => {
    const result = await captureEvidencePhoto();

    // The manifest hash covers the uploaded bytes...
    expect(result.manifest.sha256).toBe(EXPECTED_SHA256);

    // ...and equals what a server computes over the blob it receives.
    const uploadedBytes = Buffer.from(await result.blob.arrayBuffer());
    const serverSideHash = createHash("sha256")
      .update(uploadedBytes)
      .digest("hex");
    expect(result.manifest.sha256).toBe(serverSideHash);
    expect(uploadedBytes.equals(Buffer.from(FIXTURE_BYTES))).toBe(true);
  });

  it("no longer hashes the Data URL text (RA-7090 regression guard)", async () => {
    const result = await captureEvidencePhoto();
    const dataUrlTextHash = createHash("sha256")
      .update(new TextEncoder().encode(FIXTURE_DATA_URL))
      .digest("hex");
    expect(result.manifest.sha256).not.toBe(dataUrlTextHash);
  });

  it("POSTed multipart payload carries the byte hash and the original file", async () => {
    const capture = await captureEvidencePhoto();
    const form = buildEvidenceFormData(capture, {
      workflowStepId: "step1",
      evidenceClass: "PHOTO_DAMAGE",
    });

    // Payload carries the byte hash the server will verify against.
    expect(form.get("sha256")).toBe(EXPECTED_SHA256);
    expect(form.get("evidenceClass")).toBe("PHOTO_DAMAGE");
    expect(form.get("workflowStepId")).toBe("step1");
    expect(form.get("deviceType")).toBe("IOS_CAPACITOR");
    expect(form.get("capturedLat")).toBe("-33.8688");
    expect(form.get("capturedLng")).toBe("151.2093");

    const manifest = JSON.parse(form.get("structuredData") as string);
    expect(manifest.c2paManifest.sha256).toBe(EXPECTED_SHA256);

    // The original asset itself is in the payload, byte-identical.
    const file = form.get("file") as File;
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(bytes.equals(Buffer.from(FIXTURE_BYTES))).toBe(true);
  });

  it("fails the capture when hashing fails — never a silent empty hash (review #8)", async () => {
    const digestSpy = vi
      .spyOn(globalThis.crypto.subtle, "digest")
      .mockRejectedValueOnce(new Error("webcrypto unavailable"));
    try {
      await expect(captureEvidencePhoto()).rejects.toThrow(
        "webcrypto unavailable",
      );
    } finally {
      digestSpy.mockRestore();
    }
  });

  it("derives a deterministic Idempotency-Key from capture identity (review #9)", async () => {
    const capture = await captureEvidencePhoto();
    const key1 = evidenceIdempotencyKey(capture.manifest);
    const key2 = evidenceIdempotencyKey(capture.manifest);
    // Stable across retries of the SAME capture...
    expect(key1).toBe(key2);
    // ...bound to the byte hash and capture time...
    expect(key1).toContain(EXPECTED_SHA256);
    expect(key1).toContain(capture.manifest.capturedAt);
    // ...and within the server's 8-255 char Idempotency-Key bounds.
    expect(key1.length).toBeGreaterThanOrEqual(8);
    expect(key1.length).toBeLessThanOrEqual(255);
  });

  it("carries capture location into the manifest", async () => {
    const result = await captureEvidencePhoto();
    expect(result.manifest.lat).toBe(-33.8688);
    expect(result.manifest.lng).toBe(151.2093);
    expect(result.mimeType).toBe("image/jpeg");
  });
});
