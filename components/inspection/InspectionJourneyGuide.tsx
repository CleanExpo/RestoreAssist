"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  buildInspectionJourneySteps,
  type InspectionJourneyStep,
} from "@/lib/dashboard/inspection-journey-steps";
import {
  isClientEmailJourneyComplete,
  type InspectionCommsReadiness,
} from "@/lib/dashboard/inspection-comms-readiness";

type Props = {
  inspectionId: string;
  status: string;
  clientId?: string | null;
  reportId?: string | null;
  sketchRoomCount: number;
  photoCount: number;
  moistureCount: number;
  hasClassification: boolean;
  showCompletenessInbox?: boolean;
};

function dotClass(state: InspectionJourneyStep["state"]) {
  if (state === "done") return "bg-emerald-500";
  if (state === "current") return "bg-cyan-500 ring-2 ring-cyan-500/40";
  return "bg-neutral-300 dark:bg-slate-600";
}

export function InspectionJourneyGuide(props: Props) {
  const [comms, setComms] = useState<InspectionCommsReadiness | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/inspections/${props.inspectionId}/comms-readiness`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as { data: InspectionCommsReadiness };
        if (!cancelled) setComms(body.data);
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.inspectionId]);

  const clientEmailSent = comms
    ? isClientEmailJourneyComplete({
        reportDeliveredAt: comms.reportDeliveredAt,
        portalLinkEmailedAt: comms.portalLinkEmailedAt,
      })
    : false;

  const steps = buildInspectionJourneySteps({
    ...props,
    clientEmailSent,
    emailServiceConfigured: comms?.emailServiceConfigured ?? true,
    completenessGapCount: comms?.completenessBlockerCount ?? 0,
    showCompletenessInbox: props.showCompletenessInbox,
  });

  return (
    <section
      aria-label="Claim journey"
      className="md:col-span-2 lg:col-span-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/50"
    >
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
        Your path on this job
      </h3>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
        Client → floor plan → evidence → report → invoice → email (Mailtrap).
      </p>
      {!comms?.emailServiceConfigured && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 rounded-md bg-amber-500/10 px-2 py-1">
          Outbound email is not configured — portal and report sends will copy
          links only until Mailtrap or Settings → Email is set up.
        </p>
      )}
      <ol className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <li key={step.id} className="flex gap-3">
            <span
              className={cn(
                "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                dotClass(step.state),
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Step {index + 1}
                </span>
                {step.state === "current" && (
                  <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cyan-700 dark:text-cyan-300">
                    Next
                  </span>
                )}
              </div>
              <Link
                href={step.href}
                className="text-sm font-medium text-cyan-700 hover:underline dark:text-cyan-400"
              >
                {step.label}
              </Link>
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
