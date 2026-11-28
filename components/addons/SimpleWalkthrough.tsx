"use client";

/**
 * RA-8466 — the Simple walkthrough: one ordinary job through the core CRM,
 * then what each Field Add-On is for, what it costs and who can switch it on.
 *
 * Shown in the setup wizard's Field Add-Ons step (skippable, resumable) and
 * reopened from the Field Add-Ons page. It never sells: buying stays on the
 * card deck beside it, so there is one purchase path. Labels, prices and the
 * reason a pack can or cannot be added come from GET /api/addons/catalog,
 * which decides them with the same rules checkout applies.
 *
 * Progress is a per-viewer convenience kept in localStorage per account. If
 * storage is unavailable the walkthrough still works; it just starts again.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import BillingGate from "@/components/capacitor/BillingGate";
import { cn } from "@/lib/utils";
import {
  ADDON_GUIDE,
  CORE_CRM_STEPS,
  CRM_WORKS_ALONE,
  EXAMPLE_JOB,
  WHO_CAN_ENABLE,
  planFacts,
} from "@/lib/addons/addon-guide";
import { ADDON_LABEL_TEXT, type AddonLabel } from "@/lib/billing/addon-access";
import {
  cardAccess,
  type CatalogAddon,
  type CatalogResponse,
} from "./AddonCardDeck";

export type WalkthroughMode = "setup" | "reopen";
type WalkthroughStatus = "in_progress" | "skipped" | "done";

interface SavedProgress {
  status: WalkthroughStatus;
  step: number;
}

export const WALKTHROUGH_STEPS = [
  { key: "core", title: "Your CRM, one job from start to finish" },
  { key: "addons", title: "Optional Field Add-Ons" },
  { key: "next", title: "What happens next" },
] as const;

const STORAGE_PREFIX = "restoreassist:simple-walkthrough:";

export function readProgress(accountId: string): SavedProgress | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + accountId);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedProgress>;
    const status =
      v.status === "skipped" || v.status === "done" || v.status === "in_progress"
        ? v.status
        : null;
    if (!status) return null;
    const step =
      typeof v.step === "number" && v.step >= 0 && v.step < WALKTHROUGH_STEPS.length
        ? Math.floor(v.step)
        : 0;
    return { status, step };
  } catch {
    return null;
  }
}

function writeProgress(accountId: string, value: SavedProgress): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + accountId, JSON.stringify(value));
  } catch {
    /* storage blocked: progress is a convenience only */
  }
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount);
}

function packPrice(addon: CatalogAddon): string {
  const money = formatMoney(addon.amount, addon.currency);
  const period = addon.interval === "year" ? "a year" : "a month";
  return addon.perSeat
    ? `${money} ${period} per technician seat`
    : `${money} ${period} for the whole business`;
}

const LABEL_STYLE: Record<AddonLabel, string> = {
  included: "bg-success-subtle text-success-subtle-foreground ring-success/20",
  complimentary_pilot:
    "bg-success-subtle text-success-subtle-foreground ring-success/20",
  optional_paid: "bg-brand-navy/5 text-brand-navy ring-brand-navy/15 dark:text-slate-100",
  unavailable: "bg-muted text-muted-foreground ring-border",
  unknown: "bg-muted text-muted-foreground ring-border",
};

function LabelBadge({ label, testId }: { label: AddonLabel; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ring-1",
        LABEL_STYLE[label],
      )}
    >
      {ADDON_LABEL_TEXT[label]}
    </span>
  );
}

export interface SimpleWalkthroughProps {
  mode: WalkthroughMode;
  /** Reopen mode: called when the viewer closes the guide. */
  onClose?: () => void;
}

/**
 * The guide shows pack prices and the plan price, so it carries its own
 * BillingGate: in the iOS app it renders nothing and fetches nothing
 * (App Review 3.1.1), wherever it is placed.
 */
export function SimpleWalkthrough(props: SimpleWalkthroughProps) {
  return (
    <BillingGate fallback={null}>
      <SimpleWalkthroughWithAccount {...props} />
    </BillingGate>
  );
}

/**
 * Progress, step and the loaded catalogue all belong to one signed-in account.
 * Keying the content by account gives a different account a fresh guide that
 * restores its own progress, instead of showing the last account's state.
 */
function SimpleWalkthroughWithAccount(props: SimpleWalkthroughProps) {
  const accountId = useSession().data?.user?.id ?? null;
  return <SimpleWalkthroughContent key={accountId ?? "no-account"} {...props} />;
}

function SimpleWalkthroughContent({ mode, onClose }: SimpleWalkthroughProps) {
  const accountId = useSession().data?.user?.id ?? null;
  const [status, setStatus] = useState<WalkthroughStatus>("in_progress");
  const [step, setStep] = useState(0);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogError, setCatalogError] = useState(false);

  // Restore saved progress once the account is known. Reopening always shows
  // the guide, starting from the first step.
  useEffect(() => {
    if (!accountId || mode === "reopen") return;
    const saved = readProgress(accountId);
    if (saved) {
      setStatus(saved.status);
      setStep(saved.status === "done" ? 0 : saved.step);
    }
  }, [accountId, mode]);

  useEffect(() => {
    let active = true;
    fetch("/api/addons/catalog")
      .then((r) => {
        if (!r.ok) throw new Error("catalog");
        return r.json() as Promise<CatalogResponse>;
      })
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch(() => {
        if (active) setCatalogError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(
    (next: SavedProgress) => {
      setStatus(next.status);
      setStep(next.step);
      if (accountId && mode === "setup") writeProgress(accountId, next);
    },
    [accountId, mode],
  );

  const plan = planFacts();
  const isLast = step === WALKTHROUGH_STEPS.length - 1;

  if (mode === "setup" && status !== "in_progress") {
    return (
      <section
        aria-label="Simple walkthrough"
        className="flex flex-col gap-3 rounded-xl border border-brand-navy/10 bg-brand-navy/5 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-sm text-brand-navy dark:text-slate-100">
          {status === "skipped"
            ? "Walkthrough skipped. You can pick it up where you left off, or reopen it any time from Field Add-Ons."
            : "Walkthrough finished. Reopen it any time from Field Add-Ons in the side panel."}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            save({ status: "in_progress", step: status === "skipped" ? step : 0 })
          }
        >
          {status === "skipped" ? "Resume walkthrough" : "Show it again"}
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-label="Simple walkthrough"
      className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm sm:p-6 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Walkthrough, step {step + 1} of {WALKTHROUGH_STEPS.length}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-brand-navy dark:text-slate-100">
            {WALKTHROUGH_STEPS[step].title}
          </h3>
        </div>
        {mode === "setup" ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => save({ status: "skipped", step })}
          >
            Skip walkthrough
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      <div className="mt-4">
        {step === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{EXAMPLE_JOB}</p>
            <ol className="space-y-3">
              {CORE_CRM_STEPS.map((s, i) => (
                <li
                  key={s.key}
                  data-testid={`core-step-${s.key}`}
                  className="rounded-xl border border-brand-navy/10 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-brand-navy dark:text-slate-100">
                      {i + 1}. {s.title}
                    </p>
                    <LabelBadge label="included" />
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                  {mode === "reopen" ? (
                    <Link
                      href={s.href}
                      className="mt-2 inline-block text-sm font-medium text-brand-navy underline underline-offset-4 dark:text-slate-100"
                    >
                      {s.hrefLabel}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="rounded-lg bg-success-subtle px-3 py-2 text-sm font-medium text-success-subtle-foreground">
              {CRM_WORKS_ALONE}
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>{WHO_CAN_ENABLE}</li>
              <li>
                Free trial: {plan.trialDays} days. Plan:{" "}
                {formatMoney(plan.planAmount, plan.planCurrency)} a month. During
                the free trial only technician seats can be added; other packs
                start once your plan is active.
              </li>
              <li>
                Packs are billed monthly in AUD, GST inclusive, for Australian
                and New Zealand businesses alike. Cancel any time from
                Subscription settings.
              </li>
            </ul>
            {catalogError ? (
              <p role="alert" className="text-sm text-destructive">
                Couldn&apos;t load the packs. The cards below show the same
                information when they load.
              </p>
            ) : !catalog ? (
              <p className="text-sm text-muted-foreground" aria-busy="true">
                Loading the packs
              </p>
            ) : (
              <ul className="space-y-3" aria-label="Field Add-Ons explained">
                {catalog.addons.map((addon) => {
                  const guide = ADDON_GUIDE[addon.sku];
                  const access = cardAccess(
                    catalog,
                    addon.sku,
                    catalog.owned.includes(addon.sku),
                  );
                  return (
                    <li
                      key={addon.sku}
                      data-testid={`guide-${addon.sku}`}
                      className="rounded-xl border border-brand-navy/10 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-brand-navy dark:text-slate-100">
                          {addon.name}
                        </p>
                        <LabelBadge
                          label={access.label}
                          testId={`guide-label-${addon.sku}`}
                        />
                      </div>
                      <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[9rem_1fr]">
                        <dt className="font-medium text-brand-navy dark:text-slate-100">What it does</dt>
                        <dd className="text-muted-foreground">
                          {guide?.purpose ?? addon.description}
                        </dd>
                        {guide ? (
                          <>
                            <dt className="font-medium text-brand-navy dark:text-slate-100">Example</dt>
                            <dd className="text-muted-foreground">{guide.example}</dd>
                            <dt className="font-medium text-brand-navy dark:text-slate-100">What it does not do</dt>
                            <dd className="text-muted-foreground">{guide.doesNotDo}</dd>
                            <dt className="font-medium text-brand-navy dark:text-slate-100">Accounts needed</dt>
                            <dd className="text-muted-foreground">{guide.needs}</dd>
                          </>
                        ) : null}
                        <dt className="font-medium text-brand-navy dark:text-slate-100">Cost</dt>
                        <dd className="text-muted-foreground">
                          {packPrice(addon)}, {addon.currency} GST inclusive
                        </dd>
                        <dt className="font-medium text-brand-navy dark:text-slate-100">For you now</dt>
                        <dd className="text-muted-foreground">
                          {access.reason || ADDON_LABEL_TEXT[access.label]}
                          {guide?.comingSoon ? ` ${guide.comingSoon}` : ""}
                        </dd>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>{CRM_WORKS_ALONE}</p>
            {mode === "setup" ? (
              <p>
                Add a pack from the cards below if you want one, or skip them.
                When you finish setup, open your first job from My Jobs.
              </p>
            ) : (
              <p>
                <Link
                  href={CORE_CRM_STEPS[0].href}
                  className="font-medium text-brand-navy underline underline-offset-4 dark:text-slate-100"
                >
                  Start your first job
                </Link>
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0}
          onClick={() => save({ status: "in_progress", step: step - 1 })}
        >
          Previous
        </Button>
        {/* Named apart from the setup wizard's own Back and Next buttons, so
            the screen never shows two controls with the same name. */}
        {isLast ? (
          <Button
            type="button"
            onClick={() =>
              mode === "setup" ? save({ status: "done", step: 0 }) : onClose?.()
            }
          >
            Finish walkthrough
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => save({ status: "in_progress", step: step + 1 })}
          >
            Continue
          </Button>
        )}
      </div>
    </section>
  );
}
