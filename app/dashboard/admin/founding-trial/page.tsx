"use client";

/**
 * RA-7721 — grant a Founding Trial without database access.
 *
 * Preview first (a dry run that writes nothing and names the business as the
 * Australian Business Register recorded it at signup), then Apply once the
 * operator has confirmed it is the right business. The API refuses anyone not
 * on the platform-support allowlist, and any business without an ABR-confirmed
 * ABN, unless (RA-8664) the ABR lookup never finished and the founder gives a
 * reason for an override, which is recorded with the grant.
 *
 * Every Preview also shows what the business holds now (add-ons held free,
 * the base plan, any founder override), even when the ABN check stops the
 * dry run, so an already-granted business never reads as never granted.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiErrorMessage } from "@/lib/api-error-message";

interface Outcome {
  status: string;
  reason?: string;
  overridable?: boolean;
  entity?: {
    abn: string;
    legalName: string;
    tradingNames: string[];
    source?: "abr" | "founder_override";
  };
  result?: { granted: string[]; skippedPaid: string[]; applied: boolean };
  basePlan?: { outcome: string; trialEndsAt: string | null };
  conflicts?: Array<{ kind: string; id: string }>;
  /** RA-8664b: "database" when Stripe refused the key and the records answered. */
  billingCheckedBy?: "stripe" | "database";
}

/** What the business holds now, as a Preview read it (route `current`). */
interface CurrentState {
  foundingTrialAddons: string[];
  paidAddons: string[];
  owner: {
    subscriptionStatus: string | null;
    trialEndsAt: string | null;
    lifetimeAccess?: boolean;
  } | null;
  founderOverride: { recordedAt: string } | null;
}

const BASE_PLAN_TEXT: Record<string, string> = {
  extended: "Base plan free until",
  kept_longer: "Already free for longer, until",
  skipped_paying: "Already paying for the base plan; left as is",
  skipped_lifetime: "Has lifetime access; left as is",
  skipped_changed: "Account changed while granting; base plan not changed",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function addonCount(n: number): string {
  return `${n} add-on${n === 1 ? "" : "s"}`;
}

function currentBasePlanText(owner: CurrentState["owner"]): string {
  if (!owner) return "no owner account found for the base plan";
  // Lifetime access is stored as ACTIVE too; it is not a recurring payment.
  if (owner.lifetimeAccess) return "lifetime access to the base plan";
  const ends = owner.trialEndsAt;
  switch (owner.subscriptionStatus) {
    case "TRIAL":
      if (!ends) return "base plan on trial, no end date on record";
      return new Date(ends).getTime() > Date.now()
        ? `base plan free until ${formatDate(ends)}`
        : `base plan trial ended ${formatDate(ends)}`;
    case "EXPIRED":
      return ends ? `base plan trial ended ${formatDate(ends)}` : "base plan trial ended";
    case "ACTIVE":
      return "paying for the base plan";
    case "PAST_DUE":
      return "base plan payment overdue";
    case "CANCELED":
      return "base plan cancelled";
    case null:
      return "no base plan on record";
    default:
      return `base plan status ${owner.subscriptionStatus}`;
  }
}

/** One plain sentence: is this business on the Founding Trial now, and how. */
function currentStateText(current: CurrentState): string {
  const free = current.foundingTrialAddons.length;
  const override = current.founderOverride ? " (founder override recorded)" : "";
  const lead =
    free > 0
      ? `Already on the Founding Trial: ${addonCount(free)} free`
      : "Not on the Founding Trial now: no add-ons held free";
  const paid =
    current.paidAddons.length > 0
      ? ` ${addonCount(current.paidAddons.length)} paid through Stripe.`
      : "";
  return `${lead}, ${currentBasePlanText(current.owner)}${override}.${paid}`;
}

/** The business a Preview showed: what the operator ticks and Apply sends. */
interface PreviewedBusiness {
  organizationId: string;
  abn: string;
  legalName: string;
}

/** Must match ABN_OVERRIDE_MIN_REASON in lib/billing/founding-trial-grant.ts. */
const OVERRIDE_MIN_REASON = 20;

const sameBusiness = (a: PreviewedBusiness | null, b: PreviewedBusiness | null) =>
  !!a &&
  !!b &&
  a.organizationId === b.organizationId &&
  a.abn === b.abn &&
  a.legalName === b.legalName;

export default function FoundingTrialPage() {
  const router = useRouter();
  const [lookup, setLookup] = useState("");
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  // The latest Preview's business, and the snapshot the operator ticked.
  // The tick confirms one exact business: a later Preview clears it, and it
  // only counts while it matches the business on screen (review r4
  // P1-REPREVIEW-REUSES-CONFIRMATION).
  const [previewed, setPreviewed] = useState<PreviewedBusiness | null>(null);
  const [confirmed, setConfirmed] = useState<PreviewedBusiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the business holds now, from the latest Preview; cleared by Apply.
  const [current, setCurrent] = useState<CurrentState | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  // RA-8664: the override reason being typed, and the one the latest Preview
  // used. Apply sends the reason Preview used, never a later edit.
  const [overrideReason, setOverrideReason] = useState("");
  const [previewOverride, setPreviewOverride] = useState<string | null>(null);

  const trimmed = lookup.trim();
  const isAbn = /^[\d\s]+$/.test(trimmed);

  async function send(apply: boolean, overrideForPreview?: string) {
    const confirmedAtClick = confirmed;
    const override = apply ? previewOverride : (overrideForPreview ?? null);
    if (!apply) {
      setConfirmed(null);
      setPreviewed(null);
      setPreviewOverride(null);
    }
    setCurrent(null);
    setCurrentError(null);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/founding-trial", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Apply names the organisation Preview resolved and the identity the
        // operator confirmed; the grant refuses if either has changed.
        body: JSON.stringify(
          apply && confirmedAtClick
            ? {
                organizationId: confirmedAtClick.organizationId,
                apply: true,
                confirmed: confirmedAtClick,
                ...(override ? { override: { reason: override } } : {}),
              }
            : {
                ...(isAbn ? { abn: trimmed } : { organizationId: trimmed }),
                apply: false,
                ...(override ? { override: { reason: override } } : {}),
              },
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 403) {
        setError("Only RestoreAssist support staff can grant a Founding Trial.");
        setOutcome(null);
      } else if (data.outcome) {
        setOutcome(data.outcome as Outcome);
        if (!apply) {
          setCurrent((data.current as CurrentState | null | undefined) ?? null);
          setCurrentError(typeof data.currentError === "string" ? data.currentError : null);
        }
        setConfirmed(null);
        const entity = (data.outcome as Outcome).entity;
        if (
          !apply &&
          data.outcome.status === "dry_run" &&
          entity &&
          typeof data.organizationId === "string"
        ) {
          setPreviewFor(trimmed);
          setPreviewed({
            organizationId: data.organizationId,
            abn: entity.abn,
            legalName: entity.legalName,
          });
          setPreviewOverride(entity.source === "founder_override" ? override : null);
        } else {
          setPreviewFor(null);
          setPreviewed(null);
        }
      } else {
        setError(apiErrorMessage(data) ?? "The grant could not be run.");
        setOutcome(null);
      }
    } catch {
      setError("The grant could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const canApply =
    previewFor === trimmed &&
    outcome?.status === "dry_run" &&
    sameBusiness(confirmed, previewed) &&
    !busy;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/admin")}
          className="gap-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Back to Admin
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Founding Trial
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Every technician seat and add-on free, and the base plan free for
            60 days. Preview first; nothing changes until you apply.
          </p>
        </div>
        <Badge className="gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          Support staff only
        </Badge>
      </div>

      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="text-neutral-900 dark:text-white">
            Find the business
          </CardTitle>
          <CardDescription>
            Enter the business&apos;s ABN (or its organisation id).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              aria-label="ABN or organisation id"
              value={lookup}
              onChange={(e) => {
                setLookup(e.target.value);
                setConfirmed(null);
              }}
              placeholder="e.g. 12 345 678 901"
              className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
            />
            <Button
              variant="outline"
              disabled={!trimmed || busy}
              onClick={() => void send(false)}
            >
              Preview
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {current && (
            <div
              role="status"
              aria-label="Current Founding Trial state"
              className="rounded-lg border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-900 dark:border-neutral-800 dark:text-white"
            >
              {currentStateText(current)}
            </div>
          )}

          {currentError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              {currentError}
            </div>
          )}

          {outcome && outcome.status === "identity_changed" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              Not granted. The business&apos;s details changed after Preview.
              Preview again and check the name before applying.
            </div>
          )}

          {outcome && outcome.status === "unverified_abn" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {/* "Not granted" only when the read shows nothing held free: a
                  failed read, or a grant already in place, must not read as
                  the business holding nothing. */}
              {current && current.foundingTrialAddons.length === 0
                ? "Not granted."
                : "A new grant cannot run from this Preview."}{" "}
              {outcome.reason}
            </div>
          )}

          {outcome?.status === "unverified_abn" && outcome.overridable && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-neutral-900 dark:text-white">
              <p>
                The register lookup for this business never finished. The founder
                can grant it anyway. Write why; the reason is recorded with the
                grant.
              </p>
              <textarea
                aria-label="Founder override reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
              />
              <Button
                variant="outline"
                disabled={busy || overrideReason.trim().length < OVERRIDE_MIN_REASON}
                onClick={() => void send(false, overrideReason.trim())}
              >
                Preview with founder override
              </Button>
            </div>
          )}

          {outcome && (outcome.status === "refused" || outcome.status === "reverted") && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              Not granted: this business has an add-on payment in progress
              ({outcome.conflicts?.map((c) => c.id).join(", ")}). Try again once
              it has finished or expired.
            </div>
          )}

          {outcome?.entity && (
            <div className="space-y-2 rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
              <p className="font-medium text-neutral-900 dark:text-white">
                {outcome.entity.legalName}
              </p>
              {outcome.entity.source === "founder_override" && (
                <p className="text-amber-700 dark:text-amber-400">
                  Not confirmed by the Australian Business Register. Founder
                  override; the reason is recorded with the grant.
                </p>
              )}
              <p className="text-neutral-600 dark:text-neutral-400">
                ABN {outcome.entity.abn}
                {outcome.entity.tradingNames.length > 0 &&
                  ` · trading as ${outcome.entity.tradingNames.join(", ")}`}
              </p>
              <p className="text-neutral-600 dark:text-neutral-400">
                {outcome.result?.granted.length ?? 0} add-ons free
                {outcome.result && outcome.result.skippedPaid.length > 0 &&
                  ` · ${outcome.result.skippedPaid.length} already paid, left as is`}
              </p>
              {outcome.basePlan && (
                <p className="text-neutral-600 dark:text-neutral-400">
                  {BASE_PLAN_TEXT[outcome.basePlan.outcome] ?? outcome.basePlan.outcome}{" "}
                  {formatDate(outcome.basePlan.trialEndsAt)}
                </p>
              )}
              {outcome.billingCheckedBy === "database" && (
                <p className="text-amber-700 dark:text-amber-400">
                  Stripe refused the current API key, so add-on billing was checked
                  against RestoreAssist&apos;s own records: no Stripe billing on record
                  for this business.
                </p>
              )}
              {outcome.status === "granted" ? (
                <p className="font-medium text-green-700 dark:text-green-400">
                  Granted.
                </p>
              ) : (
                <label className="flex items-center gap-2 pt-2 text-neutral-900 dark:text-white">
                  <input
                    type="checkbox"
                    checked={sameBusiness(confirmed, previewed)}
                    onChange={(e) =>
                      setConfirmed(e.target.checked && previewed ? { ...previewed } : null)
                    }
                  />
                  This is the right business
                </label>
              )}
            </div>
          )}

          {outcome?.status === "dry_run" && (
            <Button disabled={!canApply} onClick={() => void send(true)}>
              {busy ? "Applying…" : "Apply Founding Trial"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
