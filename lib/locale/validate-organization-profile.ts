import { isValidAbn, normaliseAbn } from "@/lib/abn/checksum";
import {
  isSupportedCountry,
  isTimezoneForCountry,
} from "@/lib/locale/organization-locale";
import { normalizeNZBN, validateNZBN } from "@/lib/validation/nzbn-validator";

export type OrganizationLocaleProfile = {
  country: unknown;
  timezone?: string | null;
  abn?: string | null;
  nzbn?: string | null;
};

export type OrganizationLocaleValidation =
  | { valid: true; country: "AU" | "NZ" }
  | { valid: false; error: string };

/**
 * Validate the persisted tenant locale at activation and settings boundaries.
 * PATCH handlers may use `requireComplete: false` while a profile is still a
 * draft; checksum and cross-jurisdiction errors are never relaxed.
 */
export function validateOrganizationLocaleProfile(
  profile: OrganizationLocaleProfile,
  options: { requireComplete?: boolean } = {},
): OrganizationLocaleValidation {
  const requireComplete = options.requireComplete ?? true;
  if (!isSupportedCountry(profile.country)) {
    return { valid: false, error: "Country must be AU or NZ" };
  }

  if (!profile.timezone) {
    if (requireComplete) return { valid: false, error: "Timezone is required" };
  } else if (!isTimezoneForCountry(profile.country, profile.timezone)) {
    return {
      valid: false,
      error: `Timezone is not valid for ${profile.country}`,
    };
  }

  if (profile.country === "AU") {
    if (profile.nzbn) {
      return {
        valid: false,
        error: "NZBN cannot be used for an Australian organization",
      };
    }
    if (!profile.abn) {
      if (requireComplete) return { valid: false, error: "ABN is required" };
    } else {
      const normalized = normaliseAbn(profile.abn);
      if (!normalized || !isValidAbn(normalized)) {
        return { valid: false, error: "Invalid ABN" };
      }
    }
  } else {
    if (profile.abn) {
      return {
        valid: false,
        error: "ABN cannot be used for a New Zealand organization",
      };
    }
    if (!profile.nzbn) {
      if (requireComplete) return { valid: false, error: "NZBN is required" };
    } else if (!validateNZBN(normalizeNZBN(profile.nzbn)).valid) {
      return { valid: false, error: "Invalid NZBN" };
    }
  }

  return { valid: true, country: profile.country };
}
