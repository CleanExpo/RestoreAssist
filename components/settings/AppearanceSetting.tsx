"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

/**
 * Labeled theme control for the Settings page. Reuses the existing next-themes
 * provider (attribute="class", enableSystem) — it does not introduce any new
 * theme state. Hydration-safe: the active highlight is only applied after mount
 * so the server and first client render match.
 */
export function AppearanceSetting() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section
      aria-labelledby="appearance-heading"
      className="rounded-lg border border-slate-700 bg-slate-800/40 p-4"
    >
      <h2 id="appearance-heading" className="text-lg font-medium">
        Appearance
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Choose how RestoreAssist looks on this device.
      </p>

      <div
        role="radiogroup"
        aria-label="Theme"
        className="mt-3 inline-flex gap-1 rounded-lg border border-slate-700 p-1"
      >
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
                active
                  ? "bg-cyan-600 text-white"
                  : "text-slate-300 hover:bg-slate-700/60",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
