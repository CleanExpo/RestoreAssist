/**
 * RA-7550 — on-page reason the trial Upload PDF control is disabled.
 * Paid plans make extract available; the trial still generates an AI draft
 * from the form. Do not use the word "unlock".
 */

export const UPLOAD_PDF_TRIAL_TITLE = "Upload PDF is on paid plans";

export const UPLOAD_PDF_TRIAL_BODY =
  "The trial cannot extract an existing PDF. Generate an AI draft from the form below. A paid subscription makes Upload PDF available.";

export const UPLOAD_PDF_TRIAL_TOAST = UPLOAD_PDF_TRIAL_BODY;
