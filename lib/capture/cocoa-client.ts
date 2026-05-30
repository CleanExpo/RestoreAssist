/**
 * Client-side chain-of-custody helpers (rule 21).
 * SHA-256 of file bytes + optional GPS tag — both run in the browser.
 * Server re-verifies both at upload time.
 */

export async function computeSha256(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  // Wrap in a Uint8Array view: crypto.subtle.digest accepts any BufferSource,
  // and a TypedArray is recognised across realms where a raw ArrayBuffer from
  // a Blob (e.g. jsdom in tests) can fail Node's webcrypto instanceof check.
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(buffer));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface GpsReading {
  lat: number;
  lng: number;
  accuracyM: number;
}

/**
 * One-shot GPS read. Returns null on permission denied, timeout, or unsupported.
 * Never throws — capture flow must continue even without location.
 */
export function getCurrentGps(timeoutMs = 10_000): Promise<GpsReading | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
