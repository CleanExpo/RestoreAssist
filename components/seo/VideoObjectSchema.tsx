/**
 * VideoObject JSON-LD Structured Data Component
 * Renders schema.org VideoObject markup for SEO rich snippets
 * RA-245
 */

interface VideoObjectSchemaProps {
  title: string;
  description: string;
  thumbnailUrl: string[]; // [1x1, 4x3, 16x9] — 3 aspect ratios required
  uploadDate: string; // ISO 8601 with +11:00 AEDT offset
  duration: string; // ISO 8601 PT format e.g. "PT12M30S"
  embedUrl: string; // YouTube embed URL
  contentUrl?: string;
  viewCount?: number;
}

export default function VideoObjectSchema({
  title,
  description,
  thumbnailUrl,
  uploadDate,
  duration,
  embedUrl,
  contentUrl,
  viewCount,
}: VideoObjectSchemaProps) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://restoreassist.app";

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: title,
    description,
    thumbnailUrl,
    uploadDate,
    duration,
    embedUrl,
    publisher: {
      "@type": "Organization",
      name: "RestoreAssist",
      logo: {
        "@type": "ImageObject",
        url: siteUrl + "/logo.png",
      },
    },
  };

  if (contentUrl) {
    schema.contentUrl = contentUrl;
  }

  if (viewCount !== undefined) {
    schema.interactionStatistic = {
      "@type": "InteractionCounter",
      interactionType: { "@type": "WatchAction" },
      userInteractionCount: viewCount,
    };
  }

  return (
    // SAFE: JSON-LD structured data — JSON.stringify of server-controlled schema object; no user input reaches this
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
