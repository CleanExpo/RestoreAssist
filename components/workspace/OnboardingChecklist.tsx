"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ChevronRight, X, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  check: () => Promise<boolean>;
}

const CHECKLIST: Omit<ChecklistItem, "check">[] = [
  {
    id: "profile",
    label: "Complete your business profile",
    description: "Add your company name, ABN, and contact details",
    href: "/dashboard/settings",
  },
  {
    id: "ai-key",
    label: "Add an AI provider key",
    description:
      "Connect Anthropic, OpenAI, or Google AI to enable smart features",
    href: "/dashboard/settings/ai-providers",
  },
  {
    id: "inspection",
    label: "Create your first inspection",
    description: "Start a new inspection report to see RestoreAssist in action",
    href: "/dashboard/inspections/new",
  },
  {
    id: "client",
    label: "Add a client",
    description: "Save a client record for faster report generation",
    href: "/dashboard/clients",
  },
];

export default function OnboardingChecklist() {
  const router = useRouter();
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkProgress() {
      try {
        // Check each step via lightweight API calls
        const [profileRes, aiRes, inspRes, clientRes] = await Promise.all([
          fetch("/api/user/profile").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/workspace/provider-connections").then((r) =>
            r.ok ? r.json() : null,
          ),
          fetch("/api/inspections?take=1").then((r) =>
            r.ok ? r.json() : null,
          ),
          fetch("/api/clients?take=1").then((r) => (r.ok ? r.json() : null)),
        ]);

        setCompleted({
          profile: !!(profileRes?.businessName && profileRes?.businessABN),
          "ai-key": (aiRes?.connections ?? []).some(
            (c: { status: string }) => c.status === "ACTIVE",
          ),
          inspection: (inspRes?.data ?? inspRes?.inspections ?? []).length > 0,
          client: (clientRes?.data ?? clientRes?.clients ?? []).length > 0,
        });
      } catch {
        // Silently fail — checklist is a nice-to-have
      } finally {
        setLoading(false);
      }
    }
    void checkProgress();
  }, []);

  // Don't render if dismissed or if all steps complete
  if (dismissed) return null;
  const allDone = CHECKLIST.every((item) => completed[item.id]);
  if (!loading && allDone) return null;

  const completedCount = CHECKLIST.filter((item) => completed[item.id]).length;

  return (
    <Card className="border-[#8A6B4E]/20 bg-gradient-to-r from-[#1C2E47]/5 to-transparent dark:from-[#1C2E47]/20">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-[#8A6B4E]" />
          <CardTitle className="text-base">Getting started</CardTitle>
          <span className="text-xs text-neutral-500 ml-2">
            {completedCount}/{CHECKLIST.length} complete
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {CHECKLIST.map((item) => {
          const done = completed[item.id];
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.href)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                done
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "hover:bg-neutral-50 dark:hover:bg-slate-800/50",
              )}
            >
              {done ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-neutral-300 dark:text-slate-600 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    done
                      ? "text-emerald-700 dark:text-emerald-400 line-through"
                      : "text-neutral-900 dark:text-white",
                  )}
                >
                  {item.label}
                </p>
                {!done && (
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {item.description}
                  </p>
                )}
              </div>
              {!done && (
                <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
              )}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
