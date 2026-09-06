import { describe, expect, it } from "vitest";
import { validateOrganizationLocaleProfile } from "../validate-organization-profile";

describe("validateOrganizationLocaleProfile", () => {
  it("accepts a complete Australian profile", () => {
    expect(
      validateOrganizationLocaleProfile({
        country: "AU",
        timezone: "Australia/Brisbane",
        abn: "53004085616",
        nzbn: null,
      }),
    ).toEqual({ valid: true, country: "AU" });
  });

  it("accepts a complete New Zealand profile", () => {
    expect(
      validateOrganizationLocaleProfile({
        country: "NZ",
        timezone: "Pacific/Auckland",
        abn: null,
        nzbn: "9429031234566",
      }),
    ).toEqual({ valid: true, country: "NZ" });
  });

  it.each([
    ["unsupported country", { country: "US" }, "Country must be AU or NZ"],
    [
      "cross-country timezone",
      { country: "NZ", timezone: "Australia/Brisbane", nzbn: "9429031234566" },
      "Timezone is not valid for NZ",
    ],
    [
      "invalid ABN checksum",
      { country: "AU", timezone: "Australia/Brisbane", abn: "53004085617" },
      "Invalid ABN",
    ],
    [
      "invalid NZBN checksum",
      { country: "NZ", timezone: "Pacific/Auckland", nzbn: "9429031234567" },
      "Invalid NZBN",
    ],
  ])("rejects %s", (_name, profile, error) => {
    expect(validateOrganizationLocaleProfile(profile)).toEqual({
      valid: false,
      error,
    });
  });

  it("allows incomplete drafts but still rejects invalid supplied values", () => {
    expect(
      validateOrganizationLocaleProfile(
        { country: "AU", timezone: null, abn: null },
        { requireComplete: false },
      ),
    ).toEqual({ valid: true, country: "AU" });
    expect(
      validateOrganizationLocaleProfile(
        { country: "AU", timezone: null, abn: "invalid" },
        { requireComplete: false },
      ),
    ).toEqual({ valid: false, error: "Invalid ABN" });
  });
});
