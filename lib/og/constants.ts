import { BRAND } from "@/lib/brand";

/** Cache-bust query for crawlers that still hold the old navy card. */
export const OG_SHARE_PATH = "/og?v=20260823-folio";

export const ogAlt = BRAND.meta.title;
export const ogSize = { width: 1200, height: 630 } as const;
export const ogContentType = "image/png";
