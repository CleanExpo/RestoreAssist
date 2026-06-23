import Link from "next/link";
import { HELP_CATEGORY_LABELS, type HelpCategory } from "@/lib/help/types";

export type HelpArticleCardProps = {
  title: string;
  category: HelpCategory;
  slug: string;
  aiSummary: string;
  readTimeMin: number;
  updatedAt: string;
};

export default function HelpArticleCard({
  title,
  category,
  slug,
  aiSummary,
  readTimeMin,
  updatedAt,
}: HelpArticleCardProps) {
  return (
    <Link
      href={`/dashboard/help/${category}/${slug}`}
      className="group block rounded-lg border border-white/10 bg-brand-surface p-6 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-brand-surface-2"
    >
      <div className="flex items-center gap-2 text-xs text-white/60">
        <span className="rounded bg-white/5 px-2 py-0.5">{HELP_CATEGORY_LABELS[category]}</span>
        <span>·</span>
        <span>{readTimeMin} min read</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-white group-hover:text-brand-gold">{title}</h3>
      <p className="mt-2 text-sm text-white/70 line-clamp-2">{aiSummary}</p>
      <div className="mt-4 text-xs text-white/40">Updated {updatedAt}</div>
    </Link>
  );
}
