/**
 * RA-8107: before / during / after comparison with recorded provenance.
 *
 * The drag slider implies "the same place, later". It is offered only when
 * both frames record a capture time (with an offset), a known source and the
 * same room, and the later frame is genuinely later. Otherwise the frames are
 * shown side by side with the gap stated, so a reader is never shown an
 * implied comparison the evidence cannot support.
 */
import { formatInstant, isInstant, parseInstant } from "./time";

export type ComparisonSource = "inspection-photo" | "client-upload" | "unknown";

export type ComparisonFrame = Readonly<{
  photoId: string;
  stage: "before" | "during" | "after";
  url: string | null;
  alt: string;
  roomId?: string | null;
  capturedAt?: string | null;
  source: ComparisonSource;
}>;

export type ComparisonProblem =
  | "before-image-missing"
  | "after-image-missing"
  | "before-alt-text-missing"
  | "after-alt-text-missing"
  | "before-capture-time-missing"
  | "after-capture-time-missing"
  | "before-source-unknown"
  | "after-source-unknown"
  | "rooms-differ-or-missing"
  | "stage-labels-wrong"
  | "after-not-later-than-before";

export type ComparisonPlan = Readonly<{
  mode: "slider" | "side-by-side" | "unavailable";
  problems: readonly ComparisonProblem[];
  labels: Readonly<{ before: string; after: string }>;
}>;

const KNOWN_SOURCES: readonly ComparisonSource[] = ["inspection-photo", "client-upload"];
const STAGE_LABEL = { before: "Before", during: "During", after: "After" } as const;
const SOURCE_LABEL: Record<ComparisonSource, string> = {
  "inspection-photo": "inspection photo",
  "client-upload": "client upload",
  unknown: "source not recorded",
};

function hasTime(frame: ComparisonFrame, timeZone: string): boolean {
  void timeZone;
  return isInstant(frame.capturedAt);
}

function label(frame: ComparisonFrame, timeZone: string): string {
  const when = hasTime(frame, timeZone) ? `captured ${formatInstant(frame.capturedAt as string, timeZone)}` : "capture time not recorded";
  return `${STAGE_LABEL[frame.stage] ?? "Stage not recorded"}, ${when}, ${SOURCE_LABEL[frame.source] ?? SOURCE_LABEL.unknown}`;
}

export function planComparison(before: ComparisonFrame, after: ComparisonFrame, timeZone: string): ComparisonPlan {
  const problems: ComparisonProblem[] = [];
  const sides = [
    ["before", before],
    ["after", after],
  ] as const;

  let missingImage = false;
  for (const [name, frame] of sides) {
    if (!frame.url) {
      problems.push(`${name}-image-missing` as ComparisonProblem);
      missingImage = true;
    }
    if (!frame.alt || !frame.alt.trim()) problems.push(`${name}-alt-text-missing` as ComparisonProblem);
    if (!hasTime(frame, timeZone)) problems.push(`${name}-capture-time-missing` as ComparisonProblem);
    if (!KNOWN_SOURCES.includes(frame.source as ComparisonSource)) problems.push(`${name}-source-unknown` as ComparisonProblem);
  }
  const roomA = typeof before.roomId === "string" ? before.roomId.trim() : "";
  const roomB = typeof after.roomId === "string" ? after.roomId.trim() : "";
  if (!roomA || !roomB || roomA !== roomB) problems.push("rooms-differ-or-missing");
  if (before.stage !== "before" || after.stage !== "after") problems.push("stage-labels-wrong");
  if (hasTime(before, timeZone) && hasTime(after, timeZone) && (parseInstant(after.capturedAt) as number) <= (parseInstant(before.capturedAt) as number)) {
    problems.push("after-not-later-than-before");
  }

  return {
    mode: missingImage ? "unavailable" : problems.length === 0 ? "slider" : "side-by-side",
    problems,
    labels: { before: label(before, timeZone), after: label(after, timeZone) },
  };
}
