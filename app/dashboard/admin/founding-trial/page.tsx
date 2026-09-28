"use client";

/**
 * RA-7721 — grant a Founding Trial without database access.
 *
 * Preview first (a dry run that writes nothing and names the business as the
 * Australian Business Register recorded it at signup), then Apply once the
 * operator has confirmed it is the right business. The API refuses anyone not
 * on the platform-support allowlist, and any business without an ABR-confirmed
 * ABN.
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

interface Outcome {
  status: string;
  reason?: string;
  entity?: { abn: string; legalName: string; tradingNames: string[] };
  result?: { granted: string[]; skippedPaid: string[]; applied: boolean };
  basePlan?: { outcome: string; trialEndsAt: string | null };
  conflicts?: Array<{ kind: string; id: string }>;
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

export default function FoundingTrialPage() {
  const router = useRouter();
  const [lookup, setLookup] = useState("");
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [previewOrgId, setPreviewOrgId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = lookup.trim();
  const isAbn = /^[\d\s]+$/.test(trimmed);

  async function send(apply: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/founding-trial", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Apply names the organisation Preview resolved and the identity the
        // operator confirmed; the grant refuses if either has changed.
        body: JSON.stringify(
          apply && previewOrgId && outcome?.entity
            ? {
                organizationId: previewOrgId,
                apply: true,
                confirmed: {
                  organizationId: previewOrgId,
                  abn: outcome.entity.abn,
                  legalName: outcome.entity.legalName,
                },
              }
            : { ...(isAbn ? { abn: trimmed } : { organizationId: trimmed }), apply: false },
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 403) {
        setError("Only RestoreAssist support staff can grant a Founding Trial.");
        setOutcome(null);
      } else if (data.outcome) {
        setOutcome(data.outcome as Outcome);
        if (!apply && data.outcome.status === "dry_run") {
          setPreviewFor(trimmed);
          setPreviewOrgId(typeof data.organizationId === "string" ? data.organizationId : null);
        } else {
          setPreviewFor(null);
          setPreviewOrgId(null);
          setConfirmed(false);
        }
      } else {
        setError(data.error ?? "The grant could not be run.");
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
    previewOrgId !== null &&
    outcome?.status === "dry_run" &&
    confirmed &&
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
        <Badge className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400">
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
                setConfirmed(false);
              }}
              placeholder="51 824 753 556"
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

          {outcome && outcome.status === "identity_changed" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              Not granted. The business&apos;s details changed after Preview.
              Preview again and check the name before applying.
            </div>
          )}

          {outcome && outcome.status === "unverified_abn" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              Not granted. {outcome.reason}
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
              {outcome.status === "granted" ? (
                <p className="font-medium text-green-700 dark:text-green-400">
                  Granted.
                </p>
              ) : (
                <label className="flex items-center gap-2 pt-2 text-neutral-900 dark:text-white">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
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
