"use client";

import { useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dashboardSurfaceClass } from "@/app/dashboard/components/DashboardPanel";
import {
  MARGOT_SOCIAL_ROLE_PROMPT,
  MARGOT_SOCIAL_ROLE_SUMMARY,
} from "@/lib/margot/social-role-prompt";

/** Copyable Phil-aligned role prompt for Hermes / agent training. */
export function SocialRolePromptCard({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(MARGOT_SOCIAL_ROLE_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      id="social-training"
      className={cn("space-y-3 rounded-lg p-4", dashboardSurfaceClass, className)}
      data-testid="social-role-prompt-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-brand-bronze" aria-hidden />
            Social role prompt
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {MARGOT_SOCIAL_ROLE_SUMMARY}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void copyPrompt()}
          className="shrink-0"
        >
          {copied ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
      </div>

      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-foreground dark:border-slate-700 dark:bg-slate-950/60">
        {MARGOT_SOCIAL_ROLE_PROMPT}
      </pre>

      <p className="text-xs text-muted-foreground">
        Paste into Hermes <code className="text-[11px]">SOUL.md</code> on the Mac
        mini so Telegram social replies use the same rule.
      </p>
    </section>
  );
}
