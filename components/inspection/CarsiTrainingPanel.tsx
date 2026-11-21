import { ChromeExternalLink as ExternalLink } from "@/components/brand/chrome-icons";
import { RAIcon } from "@/components/brand/RAIcon";
import { cn } from "@/lib/utils";
import { carsiTrainingForClaimType } from "@/lib/carsi/training-links";

interface CarsiTrainingPanelProps {
  claimType: string | null | undefined;
  className?: string;
}

/**
 * Links a job to the matching CARSI courses (decision D-007: CARSI trains,
 * RestoreAssist links). Courses open on carsi.com.au in a new tab; nothing
 * here grants access to a paid course.
 */
export function CarsiTrainingPanel({ claimType, className }: CarsiTrainingPanelProps) {
  const { courses, catalogueUrl } = carsiTrainingForClaimType(claimType);
  return (
    <section
      aria-labelledby="carsi-training-heading"
      className={cn(
        "rounded-xl border border-neutral-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 shadow-sm p-4 sm:p-5 space-y-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <RAIcon name="report" decorative className="h-4 w-4 text-neutral-500 dark:text-slate-400" />
        <h2
          id="carsi-training-heading"
          className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-slate-400"
        >
          CARSI training for this job
        </h2>
      </div>
      {courses.length > 0 ? (
        <ul className="space-y-1.5">
          {courses.map((c) => (
            <li key={c.slug}>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-neutral-800 dark:text-slate-200 hover:underline"
              >
                {c.title}
                <ExternalLink aria-hidden className="h-3.5 w-3.5 opacity-60" />
                <span className="sr-only">(opens CARSI in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-600 dark:text-slate-400">
          No CARSI course is matched to this claim type yet.
        </p>
      )}
      <a
        href={catalogueUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-slate-400 hover:underline"
      >
        Browse all CARSI courses
        <ExternalLink aria-hidden className="h-3 w-3 opacity-60" />
        <span className="sr-only">(opens CARSI in a new tab)</span>
      </a>
    </section>
  );
}
