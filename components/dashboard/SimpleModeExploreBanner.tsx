"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

const STORAGE_KEY = "ra-simple-mode-explore-dismissed";

type Props = {
  onSwitchToAdvanced: () => void;
  switching?: boolean;
};

/**
 * Shown in Simple nav mode so owners know integrations, analytics, and team
 * tools live behind Advanced — without hiding the toggle.
 */
export function SimpleModeExploreBanner({
  onSwitchToAdvanced,
  switching,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(sessionStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-4 py-3 text-sm text-cyan-50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
        <p>
          <span className="font-medium">Need integrations, analytics, or team tools?</span>{" "}
          Switch to Advanced in the sidebar for the full menu, or open{" "}
          <Link href="/dashboard/integrations" className="underline hover:text-white">
            Integrations
          </Link>
          ,{" "}
          <Link href="/dashboard/analytics" className="underline hover:text-white">
            Analytics
          </Link>
          , and{" "}
          <Link href="/dashboard/team" className="underline hover:text-white">
            Team
          </Link>{" "}
          directly.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={switching}
          onClick={onSwitchToAdvanced}
          className="min-h-11 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          {switching ? "Saving…" : "Switch to Advanced"}
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(STORAGE_KEY, "1");
            } catch {
              /* private mode */
            }
            setVisible(false);
          }}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-cyan-500/40 text-cyan-200 hover:bg-cyan-900/50"
          aria-label="Dismiss tip"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
