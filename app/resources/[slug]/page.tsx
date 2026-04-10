import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllResources, getResourceBySlug } from "@/lib/resources";

export async function generateStaticParams() {
  const resources = await getAllResources();
  return resources.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resource = await getResourceBySlug(slug);
  if (!resource) return {};
  return {
    title: `${resource.title} | RestoreAssist`,
    description: resource.description,
    keywords: resource.keywords,
    openGraph: {
      title: resource.title,
      description: resource.description,
      images: [{ url: resource.thumbnailUrl[2] }],
      type: "article",
      publishedTime: resource.uploadDate,
    },
    alternates: { canonical: `/resources/${resource.slug}` },
  };
}

export default async function ResourceArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resource = await getResourceBySlug(slug);
  if (!resource) notFound();

  const sections = parseTranscript(resource.transcript);

  return (
    <div className="min-h-screen bg-[#1C2E47]">
      {/* Minimal header breadcrumb */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-2">
        <nav className="text-sm text-[#C4C8CA]">
          <Link
            href="/resources"
            className="hover:text-white transition-colors"
          >
            Resources
          </Link>
          <span className="mx-2 opacity-40">/</span>
          <span className="text-white truncate">{resource.title}</span>
        </nav>
      </div>

      <article className="max-w-4xl mx-auto px-4 py-8">
        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
          {resource.title}
        </h1>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-[#C4C8CA] mb-8">
          <span>
            {new Date(resource.uploadDate).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <span className="opacity-40">·</span>
          <span>{resource.author}</span>
        </div>

        {/* Article body from transcript */}
        <div className="space-y-6">
          {sections.map((section, i) => (
            <div key={i}>
              {section.heading && (
                <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-3">
                  {section.heading}
                </h2>
              )}
              {section.body && (
                <p className="text-[#C4C8CA] leading-relaxed">{section.body}</p>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-14 p-8 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-center shadow-xl">
          <h3 className="text-xl font-bold mb-2">
            Restore smarter with RestoreAssist
          </h3>
          <p className="mb-6 opacity-90 max-w-lg mx-auto">
            IICRC S500-compliant inspections, automated scope generation, and
            drying validation in one platform.
          </p>
          <Link
            href="/signup"
            className="inline-block px-8 py-3 bg-white text-cyan-600 font-semibold rounded-xl hover:bg-neutral-100 transition-colors"
          >
            Start Free Trial
          </Link>
        </div>
      </article>
    </div>
  );
}

function parseTranscript(
  transcript: string,
): { heading?: string; body: string }[] {
  const blocks = transcript.split(/\n## /);
  return blocks
    .map((block, i) => {
      if (i === 0) {
        // May start with a ## heading if transcript begins with one
        const trimmed = block.startsWith("## ") ? block.slice(3) : block;
        const lines = trimmed.split("\n");
        if (block.startsWith("## ")) {
          const [heading, ...rest] = lines;
          return { heading: heading.trim(), body: rest.join("\n").trim() };
        }
        return { body: trimmed.trim() };
      }
      const [heading, ...rest] = block.split("\n");
      return { heading: heading.trim(), body: rest.join("\n").trim() };
    })
    .filter((s) => s.body || s.heading);
}
