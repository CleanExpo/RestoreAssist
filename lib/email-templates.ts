/**
 * Branded HTML email templates for RestoreAssist lifecycle events.
 * Returns raw HTML strings (table-based for email client compatibility).
 *
 * SSOT: every template renders through `layout()`, which owns the on-brand
 * header + the professional `brandFooter()` (business identity sourced from
 * `BRAND`). Change the shell here once and every template inherits it.
 *
 * Brand palette: navy #1C2E47 (header / headings) · warm #8A6B4E (accent /
 * CTA) · light #D4A574 (highlight). Matches CLAUDE.md rule 14.
 */

import { BRAND } from "@/lib/brand";

// ── Brand tokens (single source for every template) ────────────────────────
const NAVY = "#1C2E47";
const WARM = "#8A6B4E";
const LIGHT = "#D4A574";

// ── Shared layout helpers ──────────────────────────────────────────────────

/**
 * Professional, on-brand email footer. Renders the legal entity, tagline and
 * monitored contact mailbox, and conditionally the ABN / registered address
 * when they are configured in the environment (BRAND.company reads them from
 * NEXT_PUBLIC_COMPANY_ABN / _ADDRESS). Never prints an empty "ABN:" line.
 */
function brandFooter(): string {
  const support = BRAND.company.supportEmail;
  const identityBits = [
    BRAND.company.abn ? `ABN ${escapeHtml(BRAND.company.abn)}` : "",
    BRAND.company.address ? escapeHtml(BRAND.company.address) : "",
  ].filter(Boolean);
  const identityLine = identityBits.length
    ? `<p style="margin:8px 0 0;font-size:11px;color:#94a3b8;">${identityBits.join(" &nbsp;&middot;&nbsp; ")}</p>`
    : "";

  return `
    <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px 32px;text-align:center;">
      <p style="margin:0;font-size:13px;font-weight:600;color:${NAVY};">${escapeHtml(BRAND.company.legal)}</p>
      <p style="margin:4px 0 0;font-size:12px;color:${WARM};">${escapeHtml(BRAND.tagline)}</p>
      ${identityLine}
      <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">
        You are receiving this email as a RestoreAssist account holder.<br />
        Questions or to unsubscribe, contact
        <a href="mailto:${escapeHtml(support)}" style="color:${WARM};text-decoration:none;font-weight:600;">${escapeHtml(support)}</a>.
      </p>
      <p style="margin:12px 0 0;font-size:11px;color:#cbd5e1;">Designed in Australia &middot; &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND.company.legal)}. All rights reserved.</p>
    </td>`;
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:${NAVY};border-radius:8px 8px 0 0;padding:28px 32px;text-align:center;border-bottom:3px solid ${WARM};">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">RestoreAssist</p>
              <p style="margin:6px 0 0;font-size:12px;color:${LIGHT};letter-spacing:0.5px;text-transform:uppercase;">${escapeHtml(BRAND.tagline)}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>${brandFooter()}</tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function badge(text: string, colour = WARM): string {
  return `<span style="display:inline-block;background:${colour};color:#fff;font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;letter-spacing:0.4px;text-transform:uppercase;">${escapeHtml(text)}</span>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px;font-size:13px;color:#64748b;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:8px 12px;font-size:13px;color:#1C2E47;font-weight:500;">${escapeHtml(value)}</td>
  </tr>`;
}

function infoTable(rows: string): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin:20px 0;">
    <tbody>${rows}</tbody>
  </table>`;
}

function ctaButton(text: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0;">
    <tr>
      <td style="background:${NAVY};background-image:linear-gradient(135deg,${NAVY} 0%,${WARM} 100%);border-radius:6px;">
        <a href="${href}" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(text)}</a>
      </td>
    </tr>
  </table>`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Template 1: Inspection Submitted ──────────────────────────────────────

export interface InspectionSubmittedData {
  inspectionNumber: string;
  address: string;
  technicianName: string;
}

export function inspectionSubmittedEmail(
  data: InspectionSubmittedData,
): string {
  const body = `
    <p style="margin:0 0 4px;font-size:13px;color:#64748b;">${badge("Submitted", "#10b981")}</p>
    <h1 style="margin:12px 0 0;font-size:20px;font-weight:700;color:#1C2E47;">Inspection Submitted</h1>
    <p style="margin:12px 0 24px;font-size:15px;color:#475569;">
      Your inspection has been successfully submitted and is being processed.
    </p>
    ${infoTable(
      infoRow("Inspection #", data.inspectionNumber) +
        infoRow("Property", data.address) +
        infoRow("Technician", data.technicianName),
    )}
    <p style="margin:0;font-size:14px;color:#475569;">
      You will be notified when the scope has been prepared. If you have questions,
      reply to this email or contact your account manager.
    </p>
  `;
  return layout(`Inspection Submitted — ${data.inspectionNumber}`, body);
}

// ── Template 2: Scope Ready ────────────────────────────────────────────────

export interface ScopeReadyData {
  inspectionNumber: string;
  address: string;
  scopeItemCount: number;
  portalUrl?: string;
}

export function scopeReadyEmail(data: ScopeReadyData): string {
  const body = `
    <p style="margin:0 0 4px;font-size:13px;color:#64748b;">${badge("Scope Ready", "#8A6B4E")}</p>
    <h1 style="margin:12px 0 0;font-size:20px;font-weight:700;color:#1C2E47;">Scope of Works Ready</h1>
    <p style="margin:12px 0 24px;font-size:15px;color:#475569;">
      The scope of works for your inspection has been prepared and is ready for review.
    </p>
    ${infoTable(
      infoRow("Inspection #", data.inspectionNumber) +
        infoRow("Property", data.address) +
        infoRow("Scope items", String(data.scopeItemCount)),
    )}
    ${data.portalUrl ? ctaButton("View Scope in Portal", data.portalUrl) : ""}
    <p style="margin:0;font-size:13px;color:#94a3b8;">
      Please review the scope items and confirm approval at your earliest convenience.
    </p>
  `;
  return layout(`Scope Ready — ${data.inspectionNumber}`, body);
}

// ── Template 3: Invoice Generated ─────────────────────────────────────────

export interface InvoiceGeneratedData {
  invoiceNumber: string;
  address: string;
  totalIncGST: number;
  dueDate: string;
}

export function invoiceGeneratedEmail(data: InvoiceGeneratedData): string {
  const formatted = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(data.totalIncGST);

  const body = `
    <p style="margin:0 0 4px;font-size:13px;color:#64748b;">${badge("Invoice", "#f59e0b")}</p>
    <h1 style="margin:12px 0 0;font-size:20px;font-weight:700;color:#1C2E47;">Invoice Generated</h1>
    <p style="margin:12px 0 24px;font-size:15px;color:#475569;">
      A new invoice has been generated for your restoration job.
    </p>
    ${infoTable(
      infoRow("Invoice #", data.invoiceNumber) +
        infoRow("Property", data.address) +
        infoRow("Total (inc. GST)", formatted) +
        infoRow("Due Date", data.dueDate),
    )}
    <p style="margin:0;font-size:13px;color:#94a3b8;">
      Please remit payment by the due date. For payment queries, reply to this email.
    </p>
  `;
  return layout(`Invoice ${data.invoiceNumber} — ${formatted} Due`, body);
}

// ── Template 4: Drying Goal Achieved ──────────────────────────────────────

export interface DryingGoalAchievedData {
  inspectionNumber: string;
  address: string;
  completionDate: string;
}

export function dryingGoalAchievedEmail(data: DryingGoalAchievedData): string {
  const body = `
    <p style="margin:0 0 4px;font-size:13px;color:#64748b;">${badge("Drying Complete", "#10b981")}</p>
    <h1 style="margin:12px 0 0;font-size:20px;font-weight:700;color:#1C2E47;">Drying Goal Achieved</h1>
    <p style="margin:12px 0 24px;font-size:15px;color:#475569;">
      All moisture readings are within IICRC S500 target thresholds. The drying goal has been certified as achieved.
    </p>
    ${infoTable(
      infoRow("Inspection #", data.inspectionNumber) +
        infoRow("Property", data.address) +
        infoRow("Completion Date", data.completionDate),
    )}
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;margin:20px 0;">
      <tr>
        <td style="padding:14px 16px;font-size:14px;color:#15803d;font-weight:600;">
          &#10003;&nbsp; Drying Goal: ACHIEVED — IICRC S500 §11.4 compliant
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#94a3b8;">
      Equipment can now be removed. A completion certificate has been recorded in RestoreAssist.
    </p>
  `;
  return layout(`Drying Goal Achieved — ${data.inspectionNumber}`, body);
}

// ── Template 5: Report Ready ───────────────────────────────────────────────

export interface ReportReadyData {
  inspectionNumber: string;
  address: string;
  reportUrl?: string;
}

export function reportReadyEmail(data: ReportReadyData): string {
  const body = `
    <p style="margin:0 0 4px;font-size:13px;color:#64748b;">${badge("Report Ready", "#8b5cf6")}</p>
    <h1 style="margin:12px 0 0;font-size:20px;font-weight:700;color:#1C2E47;">Report Ready for Download</h1>
    <p style="margin:12px 0 24px;font-size:15px;color:#475569;">
      The inspection report has been generated and is ready for download.
    </p>
    ${infoTable(
      infoRow("Inspection #", data.inspectionNumber) +
        infoRow("Property", data.address),
    )}
    ${data.reportUrl ? ctaButton("Download Report", data.reportUrl) : ""}
    <p style="margin:0;font-size:13px;color:#94a3b8;">
      This report is generated by RestoreAssist and complies with IICRC S500 documentation standards.
    </p>
  `;
  return layout(`Report Ready — ${data.inspectionNumber}`, body);
}

// ── Template 6: Customer Re-engagement ─────────────────────────────────────

export interface ReengagementData {
  /** Recipient's first name (or "there"). */
  recipientName: string;
  /** Where the CTA sends them — e.g. the pricing / restart page. */
  ctaUrl: string;
  /** Optional one-line acknowledgement of recent activity, shown verbatim. */
  activityNote?: string;
  /** Optional personal sign-off (e.g. "Phill"). Falls back to the brand name. */
  senderName?: string;
}

/**
 * Win-back / re-engagement email for a lapsed-but-active account. Voice:
 * professional, direct, trades-credible, no hype (marketing-copywriter). One
 * CTA. Written in second person so it reads as a personal note, not a blast.
 */
export function reengagementEmail(data: ReengagementData): string {
  const signoff = data.senderName
    ? `${escapeHtml(data.senderName)}, RestoreAssist`
    : "The RestoreAssist team";
  const activity = data.activityNote
    ? `<p style="margin:0 0 20px;font-size:15px;color:#475569;">${escapeHtml(data.activityNote)}</p>`
    : "";

  const body = `
    <p style="margin:0 0 4px;font-size:13px;color:#64748b;">${badge("Welcome back")}</p>
    <h1 style="margin:12px 0 0;font-size:20px;font-weight:700;color:#1C2E47;">Pick up where you left off</h1>
    <p style="margin:16px 0 20px;font-size:15px;color:#475569;">
      Hi ${escapeHtml(data.recipientName)}, your RestoreAssist account is still active — every inspection, report and setting is exactly where you left it.
    </p>
    ${activity}
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Your trial has ended, so report generation and a few paid features are currently capped. Restart anytime and carry on mid-job — nothing has been reset.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Setting your charge-out rates takes about two minutes, and from then on every quote and estimate reflects your pricing rather than generic defaults.
    </p>
    ${ctaButton("Restart my subscription", data.ctaUrl)}
    <p style="margin:24px 0 0;font-size:14px;color:#475569;">
      Any feedback on what is working — or what is not — is genuinely useful. Just reply to this email.
    </p>
    <p style="margin:16px 0 0;font-size:15px;color:#1C2E47;font-weight:600;">${signoff}</p>
  `;
  return layout("Pick up where you left off — RestoreAssist", body);
}
