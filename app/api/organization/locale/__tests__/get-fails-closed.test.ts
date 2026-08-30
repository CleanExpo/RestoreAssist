/**
 * Regression guard for CodeRabbit finding 5 on PR #2095.
 *
 * `GET /api/organization/locale` coerced every non-NZ value to AU:
 *
 *   const country = organization.country === "NZ" ? "NZ" : "AU";
 *
 * so a null, empty or unsupported stored country was reported to the client as
 * Australia, together with a 10% GST treatment. That is precisely what the
 * sibling module's own docstring forbids — `lib/gst/resolve-user-gst.ts` says
 * "silently treating an NZ tenant as AU creates an invalid tax invoice" — and
 * it disagreed with the PATCH branch on the same route, which already rejects
 * unsupported values through `validateOrganizationLocaleProfile`.
 *
 * The read path now fails closed the same way the write path does.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.hoisted(() => vi.fn());
const organizationFindFirst = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { organization: { findFirst: organizationFindFirst } },
}));

import { GET } from "../route";

describe("GET /api/organization/locale", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    organizationFindFirst.mockReset();
    getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  });

  it.each([
    ["AU", 10, "AUD"],
    ["NZ", 15, "NZD"],
  ] as const)(
    "returns the %s treatment for a supported country",
    async (country, ratePercent, currency) => {
      organizationFindFirst.mockResolvedValue({
        country,
        timezone: null,
        abn: null,
        acn: null,
        nzbn: null,
      });

      const response = await GET();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.country).toBe(country);
      expect(body.data.tax).toEqual(
        expect.objectContaining({ ratePercent, currency }),
      );
    },
  );

  it.each([null, "", "US", "GB", "au", 42])(
    "fails closed on an unsupported stored country instead of reporting AU: %j",
    async (country) => {
      organizationFindFirst.mockResolvedValue({
        country,
        timezone: null,
        abn: null,
        acn: null,
        nzbn: null,
      });

      const response = await GET();

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error.code).toBe("VALIDATION");
      // The precise failure that mattered: never silently AU at 10%.
      expect(JSON.stringify(body)).not.toContain('"ratePercent":10');
    },
  );

  it("still 404s when the organisation does not exist", async () => {
    organizationFindFirst.mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("still 401s without a session", async () => {
    getServerSession.mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
  });
});
