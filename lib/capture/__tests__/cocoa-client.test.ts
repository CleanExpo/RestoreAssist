// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeSha256, getCurrentGps } from "../cocoa-client";

describe("computeSha256", () => {
  it("hashes a known 1-byte input to the expected SHA-256", async () => {
    // SHA-256 of the single byte 0x00 is "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d"
    const blob = new Blob([new Uint8Array([0x00])]);
    const hex = await computeSha256(blob);
    expect(hex).toBe(
      "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
    );
  });

  it("hashes an empty file to the SHA-256 empty-string digest", async () => {
    // SHA-256("") = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    const blob = new Blob([]);
    const hex = await computeSha256(blob);
    expect(hex).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("getCurrentGps", () => {
  const realNav = globalThis.navigator;
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: realNav,
      writable: true,
    });
  });

  it("returns null when geolocation API is unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { ...realNav, geolocation: undefined },
      writable: true,
      configurable: true,
    });
    const result = await getCurrentGps(10);
    expect(result).toBeNull();
  });

  it("returns null on permission denied (errorCallback fires)", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        ...realNav,
        geolocation: {
          getCurrentPosition: (
            _ok: PositionCallback,
            err: PositionErrorCallback,
          ) => {
            err({
              code: 1,
              message: "User denied",
            } as GeolocationPositionError);
          },
        },
      },
      writable: true,
      configurable: true,
    });
    const result = await getCurrentGps(10);
    expect(result).toBeNull();
  });

  it("returns coords on success", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        ...realNav,
        geolocation: {
          getCurrentPosition: (ok: PositionCallback) => {
            ok({
              coords: {
                latitude: -27.4698,
                longitude: 153.0251,
                accuracy: 12,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: Date.now(),
            } as GeolocationPosition);
          },
        },
      },
      writable: true,
      configurable: true,
    });
    const result = await getCurrentGps(10);
    expect(result).toEqual({ lat: -27.4698, lng: 153.0251, accuracyM: 12 });
  });
});
