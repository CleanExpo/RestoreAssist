/**
 * RA-7549 — signup / pricing / post-signup honesty.
 *
 * D-022 (RA-6801) already lets a funded trial generate a Basic report
 * without a workspace BYOK key. This module is the copy SSOT so the
 * public signup page, the public pricing page, and the post-signup CTA
 * cannot drift back to "an API key is required to operate".
 *
 * Functional key wiring stays in lib/ai/platform-trial-credential.ts.
 * Do not re-derive eligibility here.
 */

export const BASIC_WITHOUT_KEY_HEADLINE =
  "Basic reports work without an API key";

export const BASIC_WITHOUT_KEY_BODY =
  "Create a Basic report on the free trial without pasting an Anthropic or OpenAI key. Provider charges apply only when you add your own key — they bill you directly, at their published rates, and we take no share.";

export const BASIC_REPORT_CTA_LABEL = "Create Basic report without API key";

/** Working Basic-report start. Trial users reach the form without a BYOK wall. */
export const BASIC_REPORT_PATH = "/dashboard/reports/new";

/** Short pricing-alert title — same claim as the headline, fewer words. */
export const PRICING_KEY_ALERT_TITLE = BASIC_WITHOUT_KEY_HEADLINE;

export const PRICING_KEY_ALERT_BODY = BASIC_WITHOUT_KEY_BODY;

export const SIGNUP_KEY_NOTE_TITLE = BASIC_WITHOUT_KEY_HEADLINE;

export const SIGNUP_KEY_NOTE_BODY = BASIC_WITHOUT_KEY_BODY;
