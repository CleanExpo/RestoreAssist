/**
 * RA-8356: the one register of every email RestoreAssist sends.
 *
 * Why it exists: three sales emails shipped with no way for the recipient to
 * stop them (Pulse RA-7979, win-back RA-8355, trial reminder RA-8356). Each
 * sender built its own HTML and added an opt-out only if its author
 * remembered. This register makes the choice explicit and testable:
 *
 * - Every exported `send*Email` function in `lib/email.ts` must appear in
 *   EMAIL_SENDERS, classed "sales" or "service". A sender missing from the
 *   register fails `lib/email/__tests__/sender-register.test.ts`.
 * - Every "sales" sender must carry the opt-out from
 *   `buildMarketingOptOut()` (List-Unsubscribe header, monitored reply-to,
 *   visible unsubscribe line, plain-text part). Checked by
 *   `lib/email/__tests__/sales-email-opt-out.test.ts`.
 * - Any other file that calls `sendEmail(` or `sendTransactionalEmail(`
 *   directly must appear in DIRECT_SEND_SITES, classed "service" or
 *   "internal". A direct send site can never be "sales": a sales email must
 *   go through a registered sales sender, so the opt-out test covers it.
 *
 * Classification rule used here (an engineering reading, not legal advice):
 * an email whose purpose includes asking the recipient to buy or resume a
 * paid service is "sales". An email that confirms or follows up the
 * recipient's own action or account is "service". A human may overrule any
 * row; the tests only require that every row exists and that sales rows
 * carry the opt-out.
 */

export type SenderClass = "sales" | "service";
export type DirectSendClass = "service" | "internal";

export interface RegisterRow<C extends string> {
  class: C;
  why: string;
}

/** Every exported sender in lib/email.ts, keyed by function name. */
export const EMAIL_SENDERS: Readonly<Record<string, RegisterRow<SenderClass>>> =
  {
    sendPulseUpdateEmail: {
      class: "service",
      why: "Job-status update on the homeowner's own active job. Carries its own one-click List-Unsubscribe (RA-7979); review asks ride on it.",
    },
    sendSignedFormEmail: {
      class: "service",
      why: "Copy of a form the recipient signed.",
    },
    sendInviteEmail: {
      class: "service",
      why: "Team invitation sent at an account holder's request.",
    },
    sendPaymentFailedEmail: {
      class: "service",
      why: "Notice about the recipient's own failed payment.",
    },
    sendSubscriptionCancelledEmail: {
      class: "service",
      why: "Confirms the recipient's own cancellation.",
    },
    sendTrialExpiringEmail: {
      class: "sales",
      why: "Asks a trial user to subscribe (RA-8356).",
    },
    sendPasswordResetEmail: {
      class: "service",
      why: "Password reset requested by the recipient.",
    },
    sendWelcomeEmail: {
      class: "service",
      why: "Confirms the recipient's own sign-up.",
    },
    sendReportCompletedEmail: {
      class: "service",
      why: "Notice that a report in the recipient's account is complete.",
    },
    sendSubscriptionActivatedEmail: {
      class: "service",
      why: "Confirms the recipient's own purchase.",
    },
    sendPricingSetupReminderEmail: {
      class: "service",
      why: "One-time setup step inside an existing account; offers nothing to buy.",
    },
    sendWinbackEmail: {
      class: "sales",
      why: "Asks a cancelled customer to restart a paid subscription (RA-8355).",
    },
    sendReengagementEmail: {
      class: "sales",
      why: "Asks a lapsed trial user to restart a paid subscription (RA-8356).",
    },
    sendSupportReplyEmail: {
      class: "service",
      why: "Reply to the recipient's own support ticket.",
    },
  };

/**
 * Files outside the email infrastructure that call sendEmail( or
 * sendTransactionalEmail( directly, keyed by repo-relative path.
 */
export const DIRECT_SEND_SITES: Readonly<
  Record<string, RegisterRow<DirectSendClass>>
> = {
  "app/api/authority-forms/[id]/send-signature-request/route.ts": {
    class: "service",
    why: "Signature request for a form the account holder prepared.",
  },
  "app/api/cron/cron-watchdog/route.ts": {
    class: "internal",
    why: "Alert to the operator when a scheduled job stalls.",
  },
  "app/api/inspections/[id]/client-portal-link/route.ts": {
    class: "service",
    why: "Portal link for the homeowner's own job, sent by their contractor.",
  },
  "app/api/invoices/[id]/send/route.ts": {
    class: "service",
    why: "Invoice for work done for the recipient.",
  },
  "app/api/notifications/email/route.ts": {
    class: "service",
    why: "Inspection, scope, invoice, drying and report notices. Re-engagement goes through sendReengagementEmail.",
  },
  "app/api/reports/[id]/send/route.ts": {
    class: "service",
    why: "Report the account holder chose to send.",
  },
  "lib/cron/process-emails.ts": {
    class: "service",
    why: "Scheduled report emails the account holder queued.",
  },
  "lib/email/founder-signup-alert.ts": {
    class: "internal",
    why: "Alert to the founder when someone signs up.",
  },
  "lib/portal/extend-and-email-invitation.ts": {
    class: "service",
    why: "Portal invitation for the homeowner's own job.",
  },
  "scripts/ops/send-test-email.ts": {
    class: "internal",
    why: "Operator's manual delivery test.",
  },
};

/** Names of every registered sales sender. */
export function salesSenders(): string[] {
  return Object.entries(EMAIL_SENDERS)
    .filter(([, row]) => row.class === "sales")
    .map(([name]) => name)
    .sort();
}
