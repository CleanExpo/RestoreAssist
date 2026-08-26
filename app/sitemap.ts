import { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/blog/articles";
import { getAllResources } from "@/lib/resources";
import { loadAllArticles } from "@/lib/help/load-article";
import { prisma } from "@/lib/prisma";

/**
 * Regenerate hourly. This file is a cached Route Handler by default, so
 * without this a newly published article or a contractor who just became
 * publicly visible would not appear in the sitemap until the next deploy —
 * and this project does not deploy on a schedule.
 */
export const revalidate = 3600;

/**
 * Google accepts at most 50,000 URLs per sitemap. The contractor directory is
 * the only unbounded source here, so it carries the cap: an unbounded
 * `findMany` would eventually both break the sitemap and hammer the database
 * on every regeneration. Truncation is logged rather than silent.
 */
const MAX_CONTRACTOR_URLS = 10_000;

type Entry = MetadataRoute.Sitemap[number];

/**
 * Marketing and legal pages, which are enumerated by hand because they have no
 * data source.
 *
 * Every route here must be indexable. `/login` used to be listed while
 * `app/login/layout.tsx` declares `robots: { index: false }`, so the sitemap
 * was asking Google to index a page the page itself refused — the two must
 * agree, and the page wins. `/setup` and `/landing/*` are absent for the same
 * reason. Transactional routes (`/billing/*`, `/forgot-password`,
 * `/onboarding/*`, `/portal/login`) are absent because they are steps in a
 * flow, not destinations.
 */
const STATIC_ROUTES: {
  path: string;
  changeFrequency: Entry["changeFrequency"];
  priority: number;
}[] = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/features", changeFrequency: "monthly", priority: 0.9 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/solutions", changeFrequency: "monthly", priority: 0.9 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.7 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.8 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.8 },
  { path: "/resources", changeFrequency: "weekly", priority: 0.7 },
  { path: "/compliance", changeFrequency: "monthly", priority: 0.8 },
  { path: "/compliance-library", changeFrequency: "monthly", priority: 0.7 },
  { path: "/help", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contractors", changeFrequency: "weekly", priority: 0.8 },
  { path: "/support", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/signup", changeFrequency: "yearly", priority: 0.5 },
];

/**
 * Run one content source. A source that throws contributes nothing rather than
 * taking the whole sitemap down with it: a partial sitemap still lets search
 * engines crawl everything else, while a thrown error yields no sitemap at all.
 */
async function collect(
  label: string,
  load: () => Promise<Entry[]>,
): Promise<Entry[]> {
  try {
    return await load();
  } catch (error) {
    console.error(
      `[sitemap] ${label} source failed, omitting its URLs:`,
      error,
    );
    return [];
  }
}

/** Parse a source's date string, falling back to now if it is unusable. */
function lastModified(value: string | Date | undefined): Date {
  if (value instanceof Date) return value;
  const parsed = value ? new Date(value) : new Date(NaN);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXTAUTH_URL || "https://restoreassist.app";

  const staticEntries: Entry[] = STATIC_ROUTES.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const [blog, resources, help, contractors] = await Promise.all([
    collect("blog", async () =>
      // getAllArticles() includes unpublished drafts, which have no route --
      // listing them would put 404s in the sitemap. Only `published` articles
      // get static params, so only they belong here.
      getAllArticles()
        .filter((article) => article.published)
        .map((article) => ({
          url: `${baseUrl}/blog/${article.slug}`,
          lastModified: lastModified(article.isoDate),
          changeFrequency: "monthly" as const,
          priority: 0.6,
        })),
    ),

    collect("resources", async () =>
      (await getAllResources()).map((resource) => ({
        url: `${baseUrl}/resources/${resource.slug}`,
        lastModified: lastModified(resource.uploadDate),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ),

    collect("help", async () =>
      // loadAllArticles() already excludes the `_fixtures` category outside
      // test mode, so test fixtures cannot leak into the published sitemap.
      (await loadAllArticles()).map(({ frontmatter }) => ({
        url: `${baseUrl}/help/${frontmatter.category}/${frontmatter.slug}`,
        lastModified: lastModified(frontmatter.updatedAt),
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
    ),

    collect("contractors", async () => {
      // Mirrors the public /api/contractors filter: only profiles the
      // contractor has chosen to make publicly visible.
      const profiles = await prisma.contractorProfile.findMany({
        where: { isPubliclyVisible: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_CONTRACTOR_URLS,
      });
      if (profiles.length === MAX_CONTRACTOR_URLS) {
        console.warn(
          `[sitemap] contractor URLs capped at ${MAX_CONTRACTOR_URLS}; ` +
            "older profiles are omitted and the directory needs splitting " +
            "across multiple sitemaps via generateSitemaps().",
        );
      }
      return profiles.map((profile) => ({
        url: `${baseUrl}/contractors/${profile.slug}`,
        lastModified: profile.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    }),
  ]);

  return [...staticEntries, ...blog, ...resources, ...help, ...contractors];
}
