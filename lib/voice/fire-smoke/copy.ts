/**
 * Everything Margot says or the walkthrough screen shows, outside the
 * checklist itself. Kept in one module so the standards-text guard
 * (copy-guard.ts) can check every string.
 */

import { FIRE_NOTICE_VERSION } from "./schema";

export const FIRE_COPY = {
  noticeVersion: FIRE_NOTICE_VERSION,
  noticeTitle: "Before we start",
  /** Spoken and shown before the microphone is used (spec §0 R7). */
  notice:
    "I'm Margot. I'll guide you through the fire and smoke make-safe, one section at a time. When you speak, your phone's browser sends the audio to its maker, Google or Apple, to turn it into text. If you would rather not, type your answers in the box instead. Tap the big button to start or stop listening.",
  noticeAccept: "I understand, start",
  welcomeBack: "Welcome back. We'll pick up where you left off.",
  listening: "Listening",
  paused: "Paused",
  toggleOn: "Tap to stop listening",
  toggleOff: "Tap to start listening",
  typedPlaceholder: "Or type your answer here",
  typedSubmit: "Save answer",
  saveFailed:
    "I could not save that. Your words are in the typing box. Check your signal and tap Save answer to try again.",
  notHeard: "Sorry, I didn't catch that. Please say it again, or type it.",
  filed: (title: string) => `Saved to ${title}.`,
  confirmNo: "Okay. Which section does it belong to? Tap one below.",
  naAskReason: "Tell me why this section does not apply, and I'll mark it N/A.",
  markedNa: (title: string) => `${title} marked not applicable.`,
  reviewStale: "New answers were saved since you read the job file. Read them, then sign again.",
  inspectionSubmitted: "This job has been submitted, so the walkthrough can no longer change.",
  confirmNa: (title: string) => `Mark the whole ${title} section as not applicable? Say yes or no.`,
  sectionDone: (title: string) => `That covers ${title}. Say more, or tap Next section.`,
  allDone:
    "Every section is filled in or marked not applicable. Please review the summary, then type your name and sign off.",
  signoffDeclaration:
    "I confirm this walkthrough is a true record of what I saw and did on site.",
  signoffNamePlaceholder: "Your full name",
  signoffButton: "Sign off walkthrough",
  signedOff: "Signed off. This walkthrough is now part of the job file.",
  changedAfterSignoff:
    "Something changed after you signed off. Please review and sign again before the job is submitted.",
  sourcesHeading: "Where this step comes from",
  standardsNote:
    "Standards are cited by title only. Use your licensed copy or your training for the detail.",
} as const;
