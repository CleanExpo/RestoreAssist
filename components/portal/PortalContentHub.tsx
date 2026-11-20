import {
  parseSimpleMarkdown,
  type PortalContentRow,
} from "@/lib/portal/portal-content";

export function PortalContentSections({
  articles,
}: {
  articles: PortalContentRow[];
}) {
  if (articles.length === 0) return null;

  const byCategory = articles.reduce<Record<string, PortalContentRow[]>>(
    (acc, row) => {
      (acc[row.category] ??= []).push(row);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-5">
      {Object.entries(byCategory).map(([category, rows]) => (
        <section
          key={category}
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-indigo-950/35 p-4 space-y-4 shadow-lg shadow-black/20"
        >
          <h2 className="text-sm font-semibold capitalize text-white/90">
            {category.replace(/-/g, " ")}
          </h2>
          {rows.map((row) => (
            <article key={row.id} className="space-y-2">
              {parseSimpleMarkdown(row.mdxContent).map((block, i) =>
                block.type === "heading" ? (
                  <h3
                    key={`${row.id}-h-${i}`}
                    className="text-sm font-medium text-slate-200"
                  >
                    {block.text}
                  </h3>
                ) : (
                  <p
                    key={`${row.id}-p-${i}`}
                    className="text-sm leading-relaxed text-slate-400"
                  >
                    {block.text}
                  </p>
                ),
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

export function PortalAboutSection({
  logoUrl,
  aboutCopy,
  orgName,
}: {
  logoUrl?: string | null;
  aboutCopy?: string | null;
  orgName?: string | null;
}) {
  if (!logoUrl && !aboutCopy) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-indigo-950/35 p-4 space-y-3 shadow-lg shadow-black/20">
      <h2 className="text-sm font-semibold text-white/90">
        About your restoration team
      </h2>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={orgName ? `${orgName} logo` : "Company logo"}
          className="h-12 w-auto object-contain"
        />
      ) : null}
      {aboutCopy ? (
        <div className="space-y-2">
          {parseSimpleMarkdown(aboutCopy).map((block, i) =>
            block.type === "heading" ? (
              <h3 key={`about-h-${i}`} className="text-sm font-medium text-slate-200">
                {block.text}
              </h3>
            ) : (
              <p key={`about-p-${i}`} className="text-sm leading-relaxed text-slate-400">
                {block.text}
              </p>
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}
