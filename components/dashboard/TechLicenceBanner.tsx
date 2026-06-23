"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RAIcon } from "@/src/components/brand/RAIcon";

interface FirstRunStep {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
}

interface FirstRunChecklistResponse {
  dismissed: boolean;
  allComplete: boolean;
  completedCount: number;
  totalCount: number;
  steps: FirstRunStep[];
}

export function TechLicenceBanner() {
  const [data, setData] = useState<FirstRunChecklistResponse | null>(null);

  useEffect(() => {
    fetch("/api/onboarding/first-run")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.dismissed) return null;
  const isTech = data.steps[0]?.id === "tech_iicrc";
  if (!isTech) return null;

  const firstIncomplete = data.steps.find((s) => !s.completed);
  const ctaHref = firstIncomplete?.href ?? "/dashboard/settings/credentials";

  return (
    <div className="border border-brand-navy/30 bg-brand-navy/8 dark:bg-brand-navy/20 rounded-lg p-4 mb-6 flex items-center gap-4">
      <div className="flex-shrink-0">
        <RAIcon name="shield" size={28} decorative />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Add your credentials to unlock attestations</p>
        <p className="text-xs text-muted-foreground">
          IICRC certificate · WHS White Card · State licence — takes a minute
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {data.steps.map((s) => {
            const short = s.title.replace(/^Add your /, "").replace(/ \(if applicable\)$/, "");
            return (
              <span
                key={s.id}
                className="text-[10px] px-2 py-0.5 border border-muted-foreground/30 rounded-full"
              >
                {short}{" "}
                {s.completed ? (
                  <RAIcon
                    name="success"
                    size={12}
                    decorative
                    className="inline-block"
                  />
                ) : (
                  "pending"
                )}
              </span>
            );
          })}
        </div>
      </div>
      <Link
        href={ctaHref}
        className="bg-brand-navy text-white px-4 py-2 rounded-md text-sm font-medium flex-shrink-0"
      >
        Add credentials →
      </Link>
    </div>
  );
}
