/**
 * Regression guard for CodeRabbit finding 5 on PR #2095.
 *
 * All six callers of `resolveUserGstTreatment` route their catch blocks
 * through `fromException`, so teaching the mapper about the locale error is
 * what actually changes the HTTP status — one edit rather than six.
 *
 * 422 rather than 400: the request itself is well formed. What is missing is
 * tenant state the caller must go and set, which is the same distinction the
 * repo already draws elsewhere between a malformed body and an unsatisfiable
 * one.
 */
import { describe, expect, it } from "vitest";

import { fromException } from "../api-errors";
import {
  ORGANIZATION_LOCALE_REQUIRED_CODE,
  OrganizationLocaleRequiredError,
} from "../gst/resolve-user-gst";

describe("fromException — organisation locale", () => {
  it("maps the locale error to 422, not a 500", async () => {
    const response = fromException(
      undefined,
      new OrganizationLocaleRequiredError(),
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION");
  });

  it("matches on the duck-typed code, not the class identity", async () => {
    // A structurally identical error crossing a module boundary (or a bundler
    // that duplicates the module) must map the same way. This is why the
    // mapper matches `code` — the same reason it duck-types Prisma's codes.
    const structural = Object.assign(new Error("locale missing"), {
      code: ORGANIZATION_LOCALE_REQUIRED_CODE,
    });

    const response = fromException(undefined, structural);

    expect(response.status).toBe(422);
  });

  it("surfaces a message that tells the tenant what to do", async () => {
    const response = fromException(
      undefined,
      new OrganizationLocaleRequiredError(),
    );

    const body = await response.json();
    expect(body.error.message).toMatch(/locale/i);
  });

  it("leaves unrelated exceptions on their existing path", async () => {
    const response = fromException(undefined, new Error("something else"));

    expect(response.status).toBe(500);
  });
});
