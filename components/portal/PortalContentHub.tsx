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
          className="bg-white rounded-xl border border-slate-200 p-4 space-y-4"
        >
          <h2 className="text-sm font-semibold text-slate-700 capitalize">
            {category.replace(/-/g, " ")}
          </h2>
          {rows.map((row) => (
            <article key={row.id} className="space-y-2">
              {parseSimpleMarkdown(row.mdxContent).map((block, i) =>
                block.type === "heading" ? (
                  <h3
                    key={`${row.id}-h-${i}`}
                    className="text-sm font-medium text-slate-800"
                  >
                    {block.text}
                  </h3>
                ) : (
                  <p
                    key={`${row.id}-p-${i}`}
                    className="text-sm text-slate-600 leading-relaxed"
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
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">About your restoration team</h2>
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
              <h3 key={`about-h-${i}`} className="text-sm font-medium text-slate-800">
                {block.text}
              </h3>
            ) : (
              <p key={`about-p-${i}`} className="text-sm text-slate-600 leading-relaxed">
                {block.text}
              </p>
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}
