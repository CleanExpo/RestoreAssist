/**
 * RA-7031 (RA-1132i) — client-side consumption of the Live Teacher /turn SSE.
 *
 * The /turn route emits `data: {json}\n\n` frames with NO `event:` names; the
 * event kind lives in the JSON `type` field. It sends one `token` frame (the
 * whole reply, not incremental) then a terminal `done`, or an `error`.
 * Verified against app/api/live-teacher/turn/route.ts (2026-07-12).
 */

export type TurnEvent =
  | { type: "token"; content: string }
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
  pending?: boolean;
};

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
