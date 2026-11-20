/**
 * The one owner of "this request was refused, and for THIS reason".
 *
 * RA-8388. A refusal test that asserts only the status passes whenever the
 * request is refused for any reason at all. Five signing tests did exactly
 * that: they sent a malformed request by mistake, got a 400 for being
 * malformed, and stayed green with the check they were named after switched
 * off. A status is shared by many refusals; the reason is not.
 *
 * So a refusal test in the folders named in
 * `scripts/ci/__tests__/ra-8388-refusal-assertion-ratchet.test.ts` asserts
 * through this helper, which will not accept a status without a reason. That
 * guard fails when one of those test files gains a new bare
 * `expect(res.status).toBe(4xx)`.
 *
 * Reads the response body once and returns it, so a test can assert more.
 */
import { expect } from "vitest";

export async function expectRefused(
  res: Response,
  status: number,
  reason: RegExp,
): Promise<unknown> {
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new Error(
      `expectRefused: ${status} is not a refusal status (400 to 599)`,
    );
  }
  // A reason that matches nothing in particular is no reason. An empty
  // pattern, or one that matches the empty string, would pass for any body.
  if (reason.source.length < 3 || reason.test("")) {
    throw new Error(
      `expectRefused: ${String(reason)} does not name a reason; give the ` +
        "sentence or code this refusal reports",
    );
  }
  expect(res.status).toBe(status);
  const body: unknown = await res.json();
  expect(JSON.stringify(body)).toMatch(reason);
  return body;
}
