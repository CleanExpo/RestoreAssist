/**
 * Restoration Pulse email templates (RA-6949, epic RA-6948).
 *
 * Pure renderers that turn ALREADY-CURATED client-portal projections into the
 * subject / html / text of a homeowner progress email. They consume only the
 * curated types (`ClientFeed` from the status feed, `AreaDryingState[]` from
 * the drying timeline) — never raw moisture readings, MC% values, or meter
 * data (drying logs are legal exhibits). This is the structural guarantee
 * behind the "curated states only" rule: a raw value cannot leak because it is
 * never passed in. Mirrors the no-raw-values discipline of PR #1777.
 */

import { escapeHtml } from "@/lib/email";
import type { ClientFeed } from "@/lib/portal/client-status-feed";
import type { AreaDryingState } from "@/lib/portal/drying-timeline";
import type { DailyDigestData } from "./digest";

export type PulseTemplateKey =
  | "pulse-step-transition"
  | "pulse-drying-update"
  | "pulse-daily-digest"
  | "pulse-cop-update";

export interface RenderedPulseEmail {
  templateKey: PulseTemplateKey;
  subject: string;
  html: string;
  text: string;
}

const BRAND_NAME = "Restore Assist";

function shell(title: string, bodyHtml: string, portalUrl: string): string {
  const safeUrl = escapeHtml(portalUrl);
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
    <div style="background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">${escapeHtml(BRAND_NAME)}</h1>
      <p style="color: rgba(255,255,255,0.95); margin: 8px 0 0; font-size: 15px;">${escapeHtml(title)}</p>
    </div>
    <div style="background: #ffffff; border-radius: 0 0 16px 16px; padding: 32px;">
      ${bodyHtml}
      <div style="text-align: center; margin: 32px 0 8px;">
        <a href="${safeUrl}" style="display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">View live progress</a>
      </div>
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">This is an automated update from ${escapeHtml(BRAND_NAME)}. Please do not reply to this email.</p>
    </div>
  </body>
</html>`;
}

/**
 * Client-visible step transition (buildClientStatusFeed projection).
 * Shows the curated stage label + job-progress percentage — never any
 * moisture / meter value.
 */
export function renderStepTransitionEmail(
  feed: ClientFeed,
  portalUrl: string,
): RenderedPulseEmail {
  const stage = feed.currentStep;
  const pct = feed.progressPct;
  const subject = `Update on your restoration — ${stage}`;

  const stepList = feed.steps
    .map(
      (s) =>
        `<li style="margin: 4px 0; color: ${s.done ? "#059669" : "#94a3b8"};">${s.done ? "&#10003; " : "&#8226; "}${escapeHtml(s.label)}</li>`,
    )
    .join("");

  const bodyHtml = `
    <p style="margin: 0 0 16px;">Hello,</p>
    <p style="margin: 0 0 16px;">There is an update on your restoration job. It is now at the <strong>${escapeHtml(stage)}</strong> stage — <strong>${pct}%</strong> of the way through.</p>
    <ul style="list-style: none; padding: 0; margin: 0 0 8px;">${stepList}</ul>`;

  const textSteps = feed.steps
    .map((s) => `  ${s.done ? "[x]" : "[ ]"} ${s.label}`)
    .join("\n");

  const text = `${BRAND_NAME} — ${subject}

Hello,

There is an update on your restoration job. It is now at the "${stage}" stage — ${pct}% of the way through.

${textSteps}

View live progress: ${portalUrl}

This is an automated update from ${BRAND_NAME}. Please do not reply to this email.`;

  return { templateKey: "pulse-step-transition", subject, html: shell("Restoration progress update", bodyHtml, portalUrl), text };
}

const DRYING_STATUS_LABEL: Record<AreaDryingState["status"], string> = {
  "on-track": "On track",
  "needs-attention": "Needs attention",
};

/**
 * Drying-goal change (buildDryingTimeline projection). Renders the curated
 * per-area state + plain-English estimate label only. `AreaDryingState`
 * carries no raw reading, MC% or threshold — so none can appear here.
 */
export function renderDryingUpdateEmail(
  areas: AreaDryingState[],
  portalUrl: string,
): RenderedPulseEmail {
  const subject = "Drying update for your property";

  const rows = areas
    .map((a) => {
      const label = DRYING_STATUS_LABEL[a.status];
      const colour = a.status === "on-track" ? "#059669" : "#d97706";
      return `<div style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
        <p style="margin: 0; font-weight: 600;">${escapeHtml(a.areaLabel)}</p>
        <p style="margin: 4px 0 0; color: ${colour}; font-weight: 600;">${escapeHtml(label)}</p>
        <p style="margin: 4px 0 0; color: #475569; font-size: 14px;">${escapeHtml(a.estimateLabel)}</p>
      </div>`;
    })
    .join("");

  const bodyHtml = `
    <p style="margin: 0 0 16px;">Hello,</p>
    <p style="margin: 0 0 16px;">Here is the latest on the drying progress at your property.</p>
    ${rows}`;

  const textRows = areas
    .map((a) => `  - ${a.areaLabel}: ${DRYING_STATUS_LABEL[a.status]} — ${a.estimateLabel}`)
    .join("\n");

  const text = `${BRAND_NAME} — ${subject}

Hello,

Here is the latest on the drying progress at your property.

${textRows}

View live progress: ${portalUrl}

This is an automated update from ${BRAND_NAME}. Please do not reply to this email.`;

  return { templateKey: "pulse-drying-update", subject, html: shell("Drying progress update", bodyHtml, portalUrl), text };
}

/**
 * Daily digest (RA-6951). Curated "X of Y areas at drying goal" count only —
 * `DailyDigestData` carries no raw reading, MC% or threshold. Next-visit line
 * is included only when a future scheduling feature populates it.
 */
export function renderDailyDigestEmail(
  digest: DailyDigestData,
  portalUrl: string,
): RenderedPulseEmail {
  const subject = `Drying update — ${digest.areasAtGoal} of ${digest.totalAreas} areas at drying goal`;

  const nextVisitHtml = digest.nextVisitLabel
    ? `<p style="margin: 16px 0 0;"><strong>Next visit:</strong> ${escapeHtml(digest.nextVisitLabel)}</p>`
    : "";
  const nextVisitText = digest.nextVisitLabel
    ? `\nNext visit: ${digest.nextVisitLabel}`
    : "";

  const bodyHtml = `
    <p style="margin: 0 0 16px;">Hello,</p>
    <p style="margin: 0 0 16px;">Here is today's drying update for your property: <strong>${digest.areasAtGoal} of ${digest.totalAreas}</strong> areas are at drying goal.</p>
    ${nextVisitHtml}`;

  const text = `${BRAND_NAME} — ${subject}

Hello,

Here is today's drying update for your property: ${digest.areasAtGoal} of ${digest.totalAreas} areas are at drying goal.
${nextVisitText}

View live progress: ${portalUrl}

This is an automated update from ${BRAND_NAME}. Please do not reply to this email.`;

  return { templateKey: "pulse-daily-digest", subject, html: shell("Your daily drying update", bodyHtml, portalUrl), text };
}

/**
 * Automatic Code of Practice update (RA-6951) — fires when 20 business days
 * have elapsed without any client-visible update (General Insurance Code of
 * Practice cadence). Reuses the same curated `ClientFeed` step-transition
 * projection as renderStepTransitionEmail, framed as a scheduled check-in
 * rather than a state change.
 */
export function renderCodeOfPracticeUpdateEmail(
  feed: ClientFeed,
  portalUrl: string,
): RenderedPulseEmail {
  const stage = feed.currentStep;
  const pct = feed.progressPct;
  const subject = "Your scheduled claim update";

  const bodyHtml = `
    <p style="margin: 0 0 16px;">Hello,</p>
    <p style="margin: 0 0 16px;">It has been a little while since your last update, so here is where things stand. Your claim is at the <strong>${escapeHtml(stage)}</strong> stage — <strong>${pct}%</strong> of the way through.</p>`;

  const text = `${BRAND_NAME} — ${subject}

Hello,

It has been a little while since your last update, so here is where things stand. Your claim is at the "${stage}" stage — ${pct}% of the way through.

View live progress: ${portalUrl}

This is an automated update from ${BRAND_NAME}. Please do not reply to this email.`;

  return { templateKey: "pulse-cop-update", subject, html: shell("Scheduled claim update", bodyHtml, portalUrl), text };
}
