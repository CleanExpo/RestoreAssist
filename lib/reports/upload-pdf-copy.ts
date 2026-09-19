/**
 * RA-7550 — on-page reason the trial Upload PDF control is disabled.
 * Extract needs a paid plan AND the workspace's own Anthropic key (the upload
 * route returns 402 without one); the trial still generates an AI draft from
 * the form. Do not use the word "unlock".
 */

export const UPLOAD_PDF_TRIAL_TITLE = "Upload PDF is on paid plans";

export const UPLOAD_PDF_TRIAL_BODY =
  "The trial cannot extract an existing PDF. Generate an AI draft from the form below. Upload PDF needs a paid subscription and your own Anthropic key, added in Workspace Settings -> AI Providers.";

export const UPLOAD_PDF_TRIAL_TOAST = UPLOAD_PDF_TRIAL_BODY;
