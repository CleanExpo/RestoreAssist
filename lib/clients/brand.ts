/**
 * Client co-brand resolver (P1 #10, RA-4859..4868).
 *
 * Two additive `Client` columns (`brandLogoUrl`, `brandPrimaryColor`) drive
 * co-branded handover packages (PDF header logo + accent colour). When a
 * field is null we fall back to the RestoreAssist defaults so existing
 * clients without brand assets keep rendering correctly.
 *
 * Validation rules (per the deliberation short-circuit on the implementation
 * brief):
 *   - `brandPrimaryColor`: 6-char hex with leading `#` (no shorthand, no rgba).
 *   - `brandLogoUrl`: HTTPS only (no HTTP, no relative).
 *
 * Both validators return zod result objects so callers (PUT/PATCH route,
 * future admin form) can surface field-specific apiError envelopes.
 */

import { z } from "zod";

/** RestoreAssist brand fallback (CLAUDE.md rule 17 — navy primary). */
export const RA_DEFAULT_PRIMARY_COLOR = "#1C2E47";

/**
 * Default logo URL for RestoreAssist. Pointer to the canonical hosted asset
 * in Supabase storage; if the asset is missing, the PDF header simply
 * renders without the image (the generator handles the failure gracefully).
 *
 * NOTE: the asset itself is not committed to this PR — the upload UI
 * lands in a follow-up. For now the fallback is the empty string, which
 * the PDF header treats as "no logo, draw text-only".
 */
export const RA_DEFAULT_LOGO_URL = "";

export const brandPrimaryColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, {
    message:
      "brandPrimaryColor must be 6-character hex with leading #, e.g. #1C2E47",
  });

export const brandLogoUrlSchema = z
  .string()
  .url({ message: "brandLogoUrl must be an absolute URL" })
  .refine((v) => v.startsWith("https://"), {
    message: "brandLogoUrl must use HTTPS",
  });

/** Optional/nullable variants used when the client may omit a field. */
export const clientBrandUpdateSchema = z.object({
  brandLogoUrl: brandLogoUrlSchema.nullable().optional(),
  brandPrimaryColor: brandPrimaryColorSchema.nullable().optional(),
});

export type ClientBrandUpdate = z.infer<typeof clientBrandUpdateSchema>;

/** Theme passed to the PDF + ZIP builders. Both fields always present. */
export interface ClientBrandTheme {
  logoUrl: string;
  primaryColor: string;
}

/**
 * Resolve the effective brand theme for a client. Nullable fields fall back
 * to the RestoreAssist defaults so the PDF generator never has to think
 * about absent values.
 */
export function resolveClientBrandTheme(
  client: { brandLogoUrl?: string | null; brandPrimaryColor?: string | null } | null | undefined,
): ClientBrandTheme {
  return {
    logoUrl: client?.brandLogoUrl ?? RA_DEFAULT_LOGO_URL,
    primaryColor: client?.brandPrimaryColor ?? RA_DEFAULT_PRIMARY_COLOR,
  };
}

/**
 * Resolve the effective brand theme for the CONTRACTOR'S OWN organisation
 * (firm branding from the setup BrandCard: `Organization.logoUrl/primaryColor`).
 * This is what makes "the entire report company branded" — distinct from
 * `resolveClientBrandTheme`, which co-brands with the insurer/client.
 *
 * Guards (so the PDF generator never has to think about bad input):
 *   - logo only embeds when it is an absolute HTTPS URL (a data-URL or relative
 *     path falls back to text-only header).
 *   - primaryColor must be 6-char hex; otherwise falls back to the RA navy.
 */
export function resolveOrgBrandTheme(
  org:
    | { logoUrl?: string | null; primaryColor?: string | null }
    | null
    | undefined,
): ClientBrandTheme {
  const logo = org?.logoUrl;
  const color = org?.primaryColor;
  return {
    logoUrl: logo && logo.startsWith("https://") ? logo : RA_DEFAULT_LOGO_URL,
    primaryColor:
      color && /^#[0-9a-fA-F]{6}$/.test(color)
        ? color
        : RA_DEFAULT_PRIMARY_COLOR,
  };
}

/**
 * Parse a hex color into 0..1 RGB triplet for pdf-lib's `rgb()` helper.
 * Tolerates lower/upper case. Caller must pre-validate via
 * `brandPrimaryColorSchema` — this helper assumes the input is well-formed.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b };
}
