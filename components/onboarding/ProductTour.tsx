"use client";

/**
 * RA-1238: In-app product tour.
 *
 * Auto-opens once on the dashboard when a user has no `productTourDismissedAt`
 * timestamp. Walks through 7 key surfaces. "Skip tour" and "Finish" both POST
 * to /api/user/product-tour with action dismiss/complete so the tour never
 * reopens for that user.
 *
 * AU/NZ copy only. Uses shadcn Dialog — no new tour library needed.
 * Respects prefers-reduced-motion (no transition animation on step change).
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Plus,
  ClipboardCheck,
  MessageSquare,
  Plug,
  Settings,
  Sparkles,
  ArrowRight,
  Check,
  type LucideIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TourStep = {
  icon: LucideIcon;
  title: string;
  body: string;
};

// 7 steps, AU/NZ-friendly copy. No US references.
const STEPS: TourStep[] = [
  {
    icon: Sparkles,
    title: "Welcome to RestoreAssist",
    body: "Let's take a 60-second tour of the tools that help Australian and New Zealand restorers run IICRC S500:2025-compliant jobs end-to-end.",
  },
  {
    icon: Plus,
    title: "Create your first report",
    body: "The New Report button in the sidebar is where every job starts. Capture site details, scope and evidence, then generate an insurer-ready PDF.",
  },
  {
    icon: ClipboardCheck,
    title: "Inspections",
    body: "Log moisture readings, psychrometric data and stabilisation progress against S500:2025 categories and classes. Readings sync into every report you create.",
  },
  {
    icon: MessageSquare,
    title: "Interviews",
    body: "Guided client and occupant interviews capture the statements insurers ask for — cause of loss, pre-existing damage, contents affected — with minimal typing.",
  },
  {
    icon: Plug,
    title: "Integrations",
    body: "Connect Xero for invoicing, Ascora for job dispatch, and your moisture meter cloud (Tramex, Protimeter, Testo) so data flows straight in. Setting these up early saves hours later.",
  },
  {
    icon: Settings,
    title: "Settings",
    body: "Add your business ABN, logo, GST details and licence info once — RestoreAssist uses them on every invoice, estimate and report. Australian GST is pre-set to 10%.",
  },
  {
    icon: Check,
    title: "You're ready to start",
    body: "Let's create your first report. You can always restart this tour from Help & Support.",
  },
];

export function ProductTour() {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  // Start "checked" true so we don't flicker open an unwanted tour before GET resolves.
  const [checked, setChecked] = useState(false);
  const didFetchRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  // Fire the tour on first dashboard visit when dismissed=false.
  useEffect(() => {
    if (status !== "authenticated") return;
    if (!pathname?.startsWith("/dashboard")) return;
    if (didFetchRef.current) return;
    didFetchRef.current = true;

    let cancelled = false;
    fetch("/api/user/product-tour")
      .then((r) => (r.ok ? r.json() : { dismissed: true }))
      .then((data: { dismissed: boolean }) => {
        if (cancelled) return;
        setChecked(true);
        if (!data.dismissed) {
          setOpen(true);
        }
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [status, pathname]);

  const markSeen = async (action: "dismiss" | "complete") => {
    setSaving(true);
    try {
      await fetch("/api/user/product-tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      // Non-blocking — user can still close the dialog.
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setOpen(false);
    await markSeen("dismiss");
  };

  const handleFinish = async () => {
    setOpen(false);
    await markSeen("complete");
    router.push("/dashboard/reports/new");
  };

  const handleNext = () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
    } else {
      handleFinish();
    }
  };

  const handleBack = () => {
    setStepIdx((i) => Math.max(0, i - 1));
  };

  if (!checked) return null;

  const step = STEPS[stepIdx];
  const Icon = step.icon;
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          // Treat outside-click / ESC as "dismiss".
          void handleSkip();
        } else {
          setOpen(next);
        }
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        // Force the dialog animation off for reduced-motion users.
        style={
          reducedMotion ? { animation: "none", transition: "none" } : undefined
        }
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                "bg-gradient-to-br from-[#1C2E47] to-[#8A6B4E] text-white",
              )}
              aria-hidden
            >
              <Icon size={20} />
            </div>
            <div className="flex-1">
              <DialogTitle>{step.title}</DialogTitle>
              <DialogDescription className="mt-1">
                Step {stepIdx + 1} of {STEPS.length}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <p className="text-sm text-neutral-700 dark:text-slate-300 leading-relaxed">
          {step.body}
        </p>

        {/* Progress dots */}
        <div
          className="flex items-center gap-1.5 pt-1"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={stepIdx + 1}
          aria-label="Tour progress"
        >
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full flex-1",
                reducedMotion ? "" : "transition-colors duration-200",
                i <= stepIdx
                  ? "bg-[#D4A574]"
                  : "bg-neutral-200 dark:bg-slate-700",
              )}
            />
          ))}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={saving}
          >
            Skip tour
          </Button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                disabled={saving}
              >
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              disabled={saving}
              className={cn(
                "bg-[#1C2E47] text-white hover:bg-[#1C2E47]/90",
                "dark:bg-[#D4A574] dark:text-[#050505] dark:hover:bg-[#D4A574]/90",
              )}
            >
              {isLast ? (
                <>
                  Create my first report
                  <ArrowRight className="ml-1" size={14} />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="ml-1" size={14} />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export default ProductTour;
