/**
 * RA-8618 (RA-8235 part B): carry the floor plan reader's own outcome from
 * the validator to the screen.
 *
 * The validator (`validate-ai-sketch-output.ts`) already writes a plain
 * message and counts the rooms it dropped. The route sends only the four
 * fields below; `dropped` carries model-written labels and stays server-side.
 */

export type ImportOutcomeStatus = "ok" | "no_plan" | "invalid";

export interface ImportOutcomeSummary {
  status: ImportOutcomeStatus;
  /** Validator-written, plain English. Never raw model text. */
  message: string;
  manualDrawingFallback: boolean;
  droppedCount: number;
}

const STATUSES: readonly ImportOutcomeStatus[] = ["ok", "no_plan", "invalid"];
const MAX_MESSAGE_LENGTH = 500;

export const MANUAL_DRAWING_HINT =
  "You can draw the floor plan by hand instead.";

/**
 * Reduce a validator outcome (or a recorded copy of one) to the fields the
 * screen needs. Anything that does not look like an outcome returns null.
 */
export function summariseReaderOutcome(
  value: unknown,
): ImportOutcomeSummary | null {
  if (!value || typeof value !== "object") return null;
  const { status, message, manualDrawingFallback, droppedCount } =
    value as Record<string, unknown>;
  if (
    typeof status !== "string" ||
    !STATUSES.includes(status as ImportOutcomeStatus) ||
    typeof message !== "string" ||
    message.length > MAX_MESSAGE_LENGTH ||
    typeof manualDrawingFallback !== "boolean" ||
    typeof droppedCount !== "number" ||
    !Number.isInteger(droppedCount) ||
    droppedCount < 0
  ) {
    return null;
  }
  return {
    status: status as ImportOutcomeStatus,
    message,
    manualDrawingFallback,
    droppedCount,
  };
}

/** What to show when a read placed no rooms. */
export function emptyImportMessage(
  summary: ImportOutcomeSummary | null | undefined,
): string {
  if (summary && summary.status !== "ok" && summary.message) {
    if (summary.manualDrawingFallback && !/by hand/i.test(summary.message)) {
      return `${summary.message} ${MANUAL_DRAWING_HINT}`;
    }
    return summary.message;
  }
  return `No rooms found in that image. Try a clearer photo with room outlines visible. ${MANUAL_DRAWING_HINT}`;
}

/** One sentence naming the rooms the validator left out, or null. */
export function droppedRoomsNote(
  summary: ImportOutcomeSummary | null | undefined,
): string | null {
  if (!summary || summary.status !== "ok" || summary.droppedCount <= 0) {
    return null;
  }
  const n = summary.droppedCount;
  return `${n} room${n === 1 ? "" : "s"} the reader found could not be used and ${n === 1 ? "was" : "were"} left out.`;
}
