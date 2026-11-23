/**
 * RA-8603: a failed upload reply may not be JSON (a hosting "body too large"
 * page, a proxy error). Reading it must never throw a parse error that hides
 * the real failure.
 */
import { describe, expect, it } from "vitest";
import { uploadFailureMessage } from "@/lib/upload-failure-message";

const FALLBACK = "Failed to upload floor plan";

describe("uploadFailureMessage", () => {
  it("returns the apiError envelope message", async () => {
    const res = new Response(
      JSON.stringify({
        error: { code: "PAYLOAD_TOO_LARGE", message: "Too big, 10 MB max." },
      }),
      { status: 413, headers: { "content-type": "application/json" } },
    );
    expect(await uploadFailureMessage(res, FALLBACK)).toBe(
      "Too big, 10 MB max.",
    );
  });

  it("falls back on a non-JSON reply instead of throwing", async () => {
    const res = new Response("<html>413 Request Entity Too Large</html>", {
      status: 413,
      headers: { "content-type": "text/html" },
    });
    expect(await uploadFailureMessage(res, FALLBACK)).toBe(FALLBACK);
  });

  it("falls back on an empty body", async () => {
    const res = new Response(null, { status: 502 });
    expect(await uploadFailureMessage(res, FALLBACK)).toBe(FALLBACK);
  });
});
