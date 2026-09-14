import { ChromeAlertTriangle } from "@/components/brand/chrome-icons";
import {
  AI_OWNERSHIP_PRE_GENERATE_BODY,
  AI_OWNERSHIP_PRE_GENERATE_TITLE,
} from "@/lib/reports/ai-ownership";

/**
 * RA-7550 — teach AI draft ≠ issued before the holder generates.
 */
export default function AiOwnershipPreGenerateNotice() {
  return (
    <section
      data-testid="ai-draft-vs-issued-notice"
      className="print:hidden rounded-[10px] border border-warning/50 bg-warning/10 px-4 py-4 space-y-1"
      aria-label={AI_OWNERSHIP_PRE_GENERATE_TITLE}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-700 text-white">
          <ChromeAlertTriangle className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            {AI_OWNERSHIP_PRE_GENERATE_TITLE}
          </p>
          <p className="text-sm text-amber-950/80 dark:text-amber-50/85">
            {AI_OWNERSHIP_PRE_GENERATE_BODY}
          </p>
        </div>
      </div>
    </section>
  );
}
