/**
 * Text the Job In (S1) — classify a technician's reply and word the bot's replies.
 *
 * Emoji are written as escapes: `npm run check:no-emoji` rejects literals.
 */

import type { ParsedObservation } from "@/lib/voice/types";
import type { JobRef } from "./job-resolution";

export const THUMBS_UP = "\u{1F44D}";

// U+FE0F variation selector and the five skin-tone modifiers.
const EMOJI_MODIFIERS = /[\u{FE0F}\u{1F3FB}-\u{1F3FF}]/gu;

export function isConfirmReply(text: string): boolean {
  const t = text.replace(EMOJI_MODIFIERS, "").trim().toLowerCase();
  return t === THUMBS_UP || t === "yes" || t === "y";
}

/** "1".."3" when the text is only a job pick, else null. */
export function parseJobPick(text: string): number | null {
  const m = /^\s*([1-3])\s*$/.exec(text);
  return m ? Number(m[1]) : null;
}

/** The code from "link ABCD2345", else null. */
export function parseLinkCommand(text: string): string | null {
  const m = /^\s*\/?link\s+([A-Za-z0-9-]{4,20})\s*$/i.exec(text);
  return m ? m[1] : null;
}

export function summariseObservation(
  parsed: ParsedObservation,
  body: string,
): string {
  if (parsed.value !== undefined && parsed.value !== null) {
    const unit = parsed.unit === "%" || !parsed.unit ? "%" : ` ${parsed.unit}`;
    const where = [parsed.room, parsed.material].filter(Boolean).join(" ");
    return `${where ? `${where} ` : ""}${parsed.value}${unit}`;
  }
  const text = (parsed.note ?? body).trim();
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export const REPLIES = {
  notLinked:
    "This chat isn't linked to a RestoreAssist account yet. Get a link code in RestoreAssist, then text: link YOURCODE",
  noOrganisation:
    "Your RestoreAssist account isn't part of an organisation yet, so there's no job to file this against.",
  linked:
    "Linked. Text a note with the job number (for example NIR-2026-09-ABC123) and I'll add it to that job as a draft.",
  badCode:
    "That link code didn't work. Codes last 10 minutes and work once. Get a new one in RestoreAssist and try again.",
  nothingToConfirm: "There's no draft waiting for you to confirm.",
  confirmFailed:
    "I couldn't save that draft. It's still on the job for review in RestoreAssist.",
  nothingToPick: "There's no note waiting for a job number.",
  pickOutOfRange: "That number isn't on the list. Reply with the job number instead.",
  tryAgain: "Something went wrong saving that. Please send it again.",
  draft(job: JobRef, summary: string): string {
    return `Draft for ${job.inspectionNumber}: ${summary}. Reply ${THUMBS_UP} or "yes" to save it. Anything else leaves it as a draft for review in RestoreAssist.`;
  },
  confirmed(job: JobRef, summary: string): string {
    return `Saved to ${job.inspectionNumber}: ${summary}.`;
  },
  pickJob(candidates: JobRef[], missingNumber: string | null): string {
    const lead = missingNumber
      ? `I couldn't find ${missingNumber} in your active jobs.`
      : "Which job is this for?";
    if (candidates.length === 0) {
      return `${lead} You have no active jobs, so I've kept the note unfiled. Resend it with the job number.`;
    }
    const list = candidates
      .map((c, i) => `${i + 1}. ${c.inspectionNumber} - ${c.propertyAddress}`)
      .join("\n");
    return `${lead} Reply with a number:\n${list}`;
  },
};
