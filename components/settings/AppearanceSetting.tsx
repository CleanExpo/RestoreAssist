"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

// Text-only labels — the design system (Phill Rule 1) forbids generic icon
// libraries (lucide/heroicons/fontawesome) in app code.
const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

/**
 * Labeled theme control for the Settings page. Reuses the existing next-themes
 * provider (attribute="class", enableSystem) — no new theme state. Uses native
 * radio inputs so the WAI-ARIA radiogroup keyboard contract (arrow-key nav,
 * roving focus) comes for free, and theme-semantic tokens so the control itself
 * adapts to both light and dark. Hydration-safe: the checked state is only
 * applied after mount so the server and first client render match.
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
      className="rounded-lg border bg-card p-4"
    >
      <h2 id="appearance-heading" className="text-lg font-medium">
        Appearance
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose how RestoreAssist looks on this device.
      </p>

      <fieldset className="mt-3 inline-flex gap-1 rounded-lg border p-1">
        <legend className="sr-only">Theme</legend>
        {OPTIONS.map(({ value, label }) => {
          const active = mounted && theme === value;
          return (
            <label
              key={value}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors",
                "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={active}
                onChange={() => setTheme(value)}
                className="sr-only"
              />
              {label}
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}
