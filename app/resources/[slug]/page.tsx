import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllResources, getResourceBySlug } from "@/lib/resources";
import { MarketingShell } from "@/components/landing/home";
import { CONTAINER } from "@/components/landing/home/motion";

const CTA =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] px-7 py-3.5 text-[15px] font-semibold tracking-tight text-white shadow-[0_1px_2px_rgba(11,31,58,0.1)] transition-colors hover:bg-[#16345A]";

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
    <MarketingShell>
      <div className="border-b border-slate-200/90 bg-white">
        <div className={`${CONTAINER} py-10 sm:py-14`}>
          <nav className="text-sm text-slate-500">
            <Link
              href="/resources"
              className="transition-colors hover:text-[#0B1F3A]"
            >
              Resources
            </Link>
            <span className="mx-2 opacity-40">/</span>
            <span className="truncate text-[#0B1F3A]">{resource.title}</span>
          </nav>

          <article className="mt-8">
            <h1 className="font-[family-name:var(--font-landing-display)] text-3xl font-semibold leading-tight tracking-tight text-[#0B1F3A] sm:text-4xl">
              {resource.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
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

            <div className="mt-10 space-y-6">
              {sections.map((section, i) => (
                <div key={i}>
                  {section.heading ? (
                    <h2 className="font-[family-name:var(--font-landing-display)] mb-3 mt-10 text-xl font-semibold tracking-tight text-[#0B1F3A] sm:text-2xl">
                      {section.heading}
                    </h2>
                  ) : null}
                  {section.body ? (
                    <p className="leading-relaxed text-slate-600">
                      {section.body}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-16 rounded-2xl border border-slate-200/90 bg-[#F3F5F7] p-8 text-center sm:p-10">
              <h3 className="font-[family-name:var(--font-landing-display)] text-xl font-semibold text-[#0B1F3A]">
                Restore smarter with RestoreAssist
              </h3>
              <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-slate-600">
                IICRC S500-compliant inspections, automated scope generation, and
                drying validation in one platform.
              </p>
              <Link href="/signup" className={`${CTA} mt-6`}>
                Start Free Trial
              </Link>
            </div>
          </article>
        </div>
      </div>
    </MarketingShell>
  );
}

function parseTranscript(
  transcript: string,
): { heading?: string; body: string }[] {
  const blocks = transcript.split(/\n## /);
  return blocks
    .map((block, i) => {
      if (i === 0) {
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
