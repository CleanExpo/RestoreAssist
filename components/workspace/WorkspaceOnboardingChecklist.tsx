"use client";

/**
 * RA-427: Workspace Onboarding First-Run Checklist
 *
 * Shown to new workspace owners on their first sign-in after workspace
 * provisioning. Dismissed when all steps are completed or when the user
 * explicitly hides it.
 *
 * Steps cover the minimum viable setup for a functional RestoreAssist workspace.
 */

import { useState } from "react";
import {
  Building2,
  Check,
  ChevronRight,
  X,
  Zap,
  Users,
  CreditCard,
  FileText,
  Brain,
} from "lucide-react";

interface ChecklistStep {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  cta: string;
}

const STEPS: ChecklistStep[] = [
  {
    id: "profile",
    icon: <Building2 size={16} />,
    title: "Complete your business profile",
    description:
      "Add your ABN, business address, and logo so they appear on reports and invoices.",
    href: "/dashboard/settings",
    cta: "Go to Settings",
  },
  {
    id: "first_report",
    icon: <FileText size={16} />,
    title: "Create your first report",
    description:
      "Start a new inspection and let RestoreAssist guide you through the IICRC S500:2025 workflow.",
    href: "/dashboard/reports/new",
    cta: "New Report",
  },
  {
    id: "ai_providers",
    icon: <Brain size={16} />,
    title: "Connect your AI provider (optional)",
    description:
      "Use your own Anthropic or OpenAI key for AI-powered scope generation and report drafting.",
    href: "/dashboard/settings/ai-providers",
    cta: "Add API Key",
  },
  {
    id: "invite_team",
    icon: <Users size={16} />,
    title: "Invite your team",
    description:
      "Add technicians and administrators to share access to your workspace.",
    href: "/dashboard/team",
    cta: "Invite Members",
  },
  {
    id: "billing",
    icon: <CreditCard size={16} />,
    title: "Review your subscription",
    description:
      "Confirm your plan is active and set up automatic billing for uninterrupted access.",
    href: "/dashboard/subscription",
    cta: "View Subscription",
  },
];

interface WorkspaceOnboardingChecklistProps {
  workspaceName: string;
  onDismiss?: () => void;
}

export function WorkspaceOnboardingChecklist({
  workspaceName,
  onDismiss,
}: WorkspaceOnboardingChecklistProps) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);

  function toggle(id: string) {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  if (dismissed) return null;

  const progress = (completed.size / STEPS.length) * 100;
  const allDone = completed.size === STEPS.length;

  return (
    <div className="border rounded-xl bg-gradient-to-br from-[#1C2E47]/5 to-transparent dark:from-[#1C2E47]/20 dark:border-slate-700 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-[#8A6B4E]" />
          <div>
            <h3 className="font-semibold text-neutral-900 dark:text-white text-sm">
              Get started with {workspaceName}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {completed.size} of {STEPS.length} steps complete
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-slate-300 transition-colors"
          aria-label="Dismiss onboarding checklist"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-neutral-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#1C2E47] dark:bg-slate-400 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <ul className="space-y-1">
        {STEPS.map((step) => {
          const done = completed.has(step.id);
          return (
            <li
              key={step.id}
              className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                done
                  ? "opacity-50"
                  : "hover:bg-white/60 dark:hover:bg-slate-800/60"
              }`}
            >
              {/* Checkbox */}
              <button
                onClick={() => toggle(step.id)}
                className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-neutral-300 dark:border-slate-600 hover:border-[#1C2E47]"
                }`}
                aria-label={
                  done ? `Unmark ${step.title}` : `Mark ${step.title} complete`
                }
              >
                {done && <Check size={11} strokeWidth={3} />}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    done
                      ? "line-through text-neutral-400"
                      : "text-neutral-900 dark:text-white"
                  }`}
                >
                  {step.title}
                </p>
                {!done && (
                  <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                    {step.description}
                  </p>
                )}
              </div>

              {/* CTA link */}
              {!done && (
                <a
                  href={step.href}
                  className="shrink-0 flex items-center gap-1 text-xs text-[#1C2E47] dark:text-slate-300 font-medium hover:underline"
                >
                  {step.cta}
                  <ChevronRight size={12} />
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {/* All done celebration */}
      {allDone && (
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-lg px-3 py-2 text-sm">
          <Check size={14} />
          <span>You&apos;re all set! Your workspace is ready to use.</span>
          <button onClick={handleDismiss} className="ml-auto text-xs underline">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
