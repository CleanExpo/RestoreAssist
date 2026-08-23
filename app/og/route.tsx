import { createShareOgImage } from "@/lib/og/share-card";

// Versioned share-card endpoint for social crawlers. Prefer this path over
// /opengraph-image in metadata so LinkedIn/Slack cannot serve a stale cache
// of the old navy card at the previous default URL.
export async function GET() {
  return createShareOgImage();
}
