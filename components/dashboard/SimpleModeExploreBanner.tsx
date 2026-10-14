"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { buildSimpleNavItems } from "@/app/dashboard/nav-config";

const STORAGE_KEY = "ra-simple-mode-explore-dismissed";

type Props = {
  onSwitchToAdvanced: () => void;
  switching?: boolean;
  isManager?: boolean;
};

/**
 * Simple mode — every sidebar destination is one tap away from the overview.
 */
export function SimpleModeExploreBanner({
  onSwitchToAdvanced,
  switching,
  isManager = false,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(sessionStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  const navItems = buildSimpleNavItems({ isManager }).filter(
    (item) => item.href !== "/dashboard",
  );

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Simple workspace"
      className="mb-6 overflow-hidden rounded-xl border border-cyan-500/25 bg-gradient-to-br from-cyan-950/50 via-slate-900/80 to-slate-950 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Simple workspace
          </p>
          <p className="mt-2 text-sm text-slate-200">
            <span className="font-medium text-white">Everything in one place.</span>{" "}
            These match your sidebar — jobs, reports, clients, billing, and help.
            Need integrations or analytics? Switch to Advanced anytime.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={switching}
            onClick={onSwitchToAdvanced}
            className="min-h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
          >
            {switching ? "Saving…" : "Advanced menu"}
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
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/5"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <nav
        aria-label="Simple navigation"
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-2 text-center text-xs font-medium text-slate-100 transition hover:border-cyan-400/35 hover:bg-cyan-500/10 sm:text-sm"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
