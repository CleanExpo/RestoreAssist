/**
 * RA-7031 (RA-1132i) — client-side consumption of the Live Teacher /turn SSE.
 *
 * The /turn route emits `data: {json}\n\n` frames with NO `event:` names; the
 * event kind lives in the JSON `type` field. Per turn it may send one or more
 * `tool_call` frames (RA-1132f — an action the teacher took), then one `token`
 * frame (the whole reply, not incremental), then a terminal `done`, or an
 * `error`. Verified against app/api/live-teacher/turn/route.ts (2026-07-12).
 */

/** An action the teacher took during a turn (RA-1132f). */
export type LiveTeacherToolCall = {
  id: string;
  toolName: string;
  ok: boolean;
  result?: unknown;
  error?: string | null;
};

export type TurnEvent =
  | { type: "token"; content: string }
  | ({ type: "tool_call" } & LiveTeacherToolCall)
  | {
      type: "done";
      utteranceId: string;
      clauseRefs: string[];
      confidence: number; // 0..1 (route normalises from the 0..100 model score)
    }
  | { type: "error"; message: string };

/** A rendered line in the transcript. */
export type TranscriptTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  clauseRefs?: string[];
  confidence?: number; // 0..1
  toolCalls?: LiveTeacherToolCall[];
  pending?: boolean;
};

/** "take_reading" -> "Take reading". Used for card labels and fallbacks. */
export function humaniseToolName(toolName: string): string {
  const label = toolName.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Human-readable one-line summary of a SUCCESSFUL tool call, for the transcript
 * card. Defensive against the `result` shape — the backend owns it, and the
 * summary must never throw while rendering.
 */
export function summariseToolCall(call: LiveTeacherToolCall): string {
  const r = (call.result ?? {}) as Record<string, unknown>;
  if (call.toolName === "take_reading") {
    const location = typeof r.location === "string" ? r.location : "reading";
    const unit = typeof r.unit === "string" ? ` ${r.unit}` : "";
    return typeof r.value === "number"
      ? `Logged reading — ${location}: ${r.value}${unit}`
      : `Logged reading — ${location}`;
  }
  if (call.toolName === "check_report_gaps") {
    const n = toolCallGaps(call).length;
    return n === 0
      ? "Report check — looks complete"
      : `Report check — ${n} gap${n === 1 ? "" : "s"} to address`;
  }
  return humaniseToolName(call.toolName);
}

/** A completeness gap surfaced by the check_report_gaps tool. */
export type ReportGapSummary = {
  field: string;
  severity: "warn" | "block";
  description: string;
};

/**
 * Extract the gap list from a check_report_gaps result. Defensive against the
 * result shape (the backend owns it) — returns [] for any other tool or a
 * malformed payload, and never throws while rendering.
 */
export function toolCallGaps(call: LiveTeacherToolCall): ReportGapSummary[] {
  if (call.toolName !== "check_report_gaps") return [];
  const raw = (call.result as { gaps?: unknown } | null | undefined)?.gaps;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
    .map((g) => ({
      field: typeof g.field === "string" ? g.field : "",
      severity: g.severity === "block" ? ("block" as const) : ("warn" as const),
      description: typeof g.description === "string" ? g.description : "",
    }))
    .filter((g) => g.description !== "");
}

/**
 * Parse the complete `data:` frames present in `buffer`, returning the decoded
 * events and any trailing partial frame to carry into the next read. Malformed
 * frames are skipped defensively — the backend owns the format.
 */
export function parseTurnFrames(buffer: string): {
  events: TurnEvent[];
  rest: string;
} {
  const events: TurnEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const line = part.trim();
    if (!line) continue;
    const jsonStr = line.startsWith("data:") ? line.slice(5).trim() : line;
    if (!jsonStr) continue;
    try {
      const parsed = JSON.parse(jsonStr) as TurnEvent;
      if (parsed && typeof parsed.type === "string") events.push(parsed);
    } catch {
      // ignore a malformed / partial frame
    }
  }
  return { events, rest };
}

/**
 * Read a /turn Response body to completion, invoking `onEvent` for each decoded
 * SSE frame. Throws if the response is not streamable.
 */
export async function streamTurn(
  res: Response,
  onEvent: (event: TurnEvent) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Live Teacher stream not supported");
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseTurnFrames(buffer);
    buffer = rest;
    for (const event of events) onEvent(event);
  }
  const tail = buffer.trim();
  if (tail) {
    const { events } = parseTurnFrames(`${tail}\n\n`);
    for (const event of events) onEvent(event);
  }
}
