import { prisma } from "@/lib/prisma";
import {
  parseSimpleMarkdown,
  type PortalContentRow,
} from "@/lib/portal/portal-content";

export async function fetchPublishedPortalContent(
  audience = "customer",
): Promise<PortalContentRow[]> {
  return prisma.portalContent.findMany({
    where: {
      audience,
      state: "PUBLISHED",
      scope: { in: ["PLATFORM_DEFAULT"] },
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
