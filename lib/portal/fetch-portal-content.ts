import { prisma } from "@/lib/prisma";
import {
  parseSimpleMarkdown,
  type PortalContentRow,
} from "@/lib/portal/portal-content";

/**
 * Load the published client-portal articles.
 *
 * `includeAddonContent` decides whether rows behind the CLIENT_EDUCATION add-on
 * are returned. It defaults to FALSE deliberately: a caller that forgets to
 * resolve the entitlement gets the free set, never the paid one. The opposite
 * default would turn every missed call site into a silent content leak that no
 * test would notice, because the page would look right — just fuller than the
 * customer paid for.
 *
 * The filter is applied in the QUERY, not by filtering the result in the page.
 * Fetching paid rows and hiding them in the component would ship them to the
 * browser inside the RSC payload, where anyone can read them.
 */
export async function fetchPublishedPortalContent(
  audience = "customer",
  { includeAddonContent = false }: { includeAddonContent?: boolean } = {},
): Promise<PortalContentRow[]> {
  return prisma.portalContent.findMany({
    where: {
      audience,
      state: "PUBLISHED",
      scope: { in: ["PLATFORM_DEFAULT"] },
      ...(includeAddonContent ? {} : { requiresAddon: false }),
    },
    orderBy: [{ category: "asc" }, { slug: "asc" }],
    take: 50,
    select: {
      id: true,
      category: true,
      slug: true,
      mdxContent: true,
      videoSlug: true,
    },
  });
}

export { parseSimpleMarkdown };
