/**
 * Regression guard for CodeRabbit finding 5 on PR #2095.
 *
 * `resolveUserGstTreatment` fails closed on an unsupported organisation
 * country — that part was already right. What was wrong is *how* it failed:
 * a bare `Error` reaches `fromException` as an unrecognised exception and is
 * reported as a 500 INTERNAL. A tenant who simply has not finished setting
 * their locale is not a server fault, and paging on it drowns the
 * observability feed that `apiError` deliberately reserves for 5xx.
 *
 * The error now carries a duck-typed `code`, matching the convention
 * `fromException` already uses for Prisma ("P2025", "P2002", …) so the mapper
 * needs no import from a `server-only` module.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: userFindUnique } },
}));

import {
  ORGANIZATION_LOCALE_REQUIRED_CODE,
  OrganizationLocaleRequiredError,
  resolveUserGstTreatment,
} from "../resolve-user-gst";

describe("OrganizationLocaleRequiredError", () => {
  beforeEach(() => {
    userFindUnique.mockReset();
  });

  it.each([null, { organization: null }, { organization: { country: "US" } }])(
    "throws the typed locale error, not a bare Error: %j",
    async (record) => {
      userFindUnique.mockResolvedValue(record);

      await expect(resolveUserGstTreatment("user-1")).rejects.toBeInstanceOf(
        OrganizationLocaleRequiredError,
      );
    },
  );

  it("carries the duck-typed code fromException matches on", async () => {
    userFindUnique.mockResolvedValue({ organization: { country: "US" } });

    await expect(resolveUserGstTreatment("user-1")).rejects.toMatchObject({
      code: ORGANIZATION_LOCALE_REQUIRED_CODE,
    });
  });

  it("keeps the existing message so nothing that reads it regresses", async () => {
    userFindUnique.mockResolvedValue({ organization: null });

    await expect(resolveUserGstTreatment("user-1")).rejects.toThrow(
      "Organization locale is required before financial work",
    );
  });

  it("is still an Error, so existing catch blocks keep working", async () => {
    userFindUnique.mockResolvedValue({ organization: null });

    await expect(resolveUserGstTreatment("user-1")).rejects.toBeInstanceOf(
      Error,
    );
  });
});
