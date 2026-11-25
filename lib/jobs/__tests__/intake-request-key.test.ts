import { describe, expect, it } from "vitest";
import { keyForSubmission } from "@/lib/jobs/intake-request-key";

function counter() {
  let n = 0;
  return () => `key-${++n}`;
}

describe("keyForSubmission (RA-8495)", () => {
  it("reuses the key when the same body is sent again", () => {
    const next = counter();
    const first = keyForSubmission(null, '{"propertyPostcode":"2750"}', next);
    const retry = keyForSubmission(first, '{"propertyPostcode":"2750"}', next);
    expect(retry.key).toBe(first.key);
  });

  it("takes a new key when a refused form is corrected and sent again", () => {
    const next = counter();
    const refused = keyForSubmission(null, '{"propertyPostcode":"275"}', next);
    const corrected = keyForSubmission(refused, '{"propertyPostcode":"2750"}', next);
    expect(corrected.key).not.toBe(refused.key);
    expect(corrected.body).toBe('{"propertyPostcode":"2750"}');
  });

  it("takes a new key for the first save", () => {
    expect(keyForSubmission(null, "{}", counter()).key).toBe("key-1");
  });
});
