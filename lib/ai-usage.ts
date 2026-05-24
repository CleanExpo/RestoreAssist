/**
 * AI usage tracking — RA-1087 stub
 *
 * Minimal interface for logging an AI API call (provider, model, tokens,
 * feature). Currently emits a structured JSON log to stdout — picked up
 * by Vercel logs and (via the Sentry breadcrumb auto-attach) by Sentry.
 *
 * NOT a no-op: every event lands in observability. The "stub" part is
 * that there's no persistent `UsageEvent` table backing this yet — the
 * full RA-1087 implementation adds Prisma persistence so usage can be
 * billed / quota'd / reported per workspace.
 *
 * Adopt by:
 *   import { logAiUsage } from "@/lib/ai-usage";
 *   logAiUsage({ model: "claude-opus-4-7", feature: "llmClassify", usage: response.usage });
 *
 * Future contract — what RA-1087 full implementation will add:
 *   - persist to `UsageEvent` table keyed by (workspaceId, userId, feature)
 *   - aggregate per billing period for analytics dashboard
 *   - feed into the subscription / credit quota enforcer
 * The shape of `AiUsageEvent` is the public contract — adding fields here
 * is safe (consumers ignore unknown fields); changing/removing breaks
 * adopters.
 */

export interface AiUsageEvent {
  /** Model identifier — e.g. "claude-opus-4-7", "gpt-5.4", "gemini-3.1-pro" */
  model: string;
  /** Feature that triggered the call — "llmClassify", "liveTeacher.turn", etc. */
  feature: string;
  /** Anthropic / OpenAI / Gemini SDK usage shape. Accepts the raw `response.usage`
   *  object verbatim — only the four canonical token fields are read; any
   *  extra provider-specific fields (e.g. Anthropic's `service_tier`,
   *  `server_tool_use`) are ignored. Typed as `object` so the structural
   *  assignability check passes against any SDK's strongly-typed
   *  `Usage` definition. */
  usage: object;
  /** Authoritative user ID from `session.user.id`. Optional only during the
   *  stub phase — full RA-1087 will require it. */
  userId?: string;
  /** Workspace / Organization ID. Optional during the stub phase. */
  workspaceId?: string;
  /** Optional cost in AUD cents (some callers pre-compute this). */
  costAudCents?: number;
}

/**
 * Log a single AI API usage event. Side-effect only; returns void.
 *
 * Safe to call from API routes, server actions, and background jobs.
 * Errors are swallowed — observability writes must never throw into
 * the user-facing request path.
 */
/** Safely pull a numeric token-count field off a vendor SDK's usage object. */
function tokenField(usage: object, key: string): number {
  const value = (usage as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
}

export function logAiUsage(event: AiUsageEvent): void {
  try {
    // Structured JSON line — Vercel logs ingest this verbatim; Sentry's
    // serverless integration captures the JSON as a breadcrumb on any
    // exception in the same request.
    console.log(
      JSON.stringify({
        event: "ai_usage",
        timestamp: new Date().toISOString(),
        model: event.model,
        feature: event.feature,
        input_tokens: tokenField(event.usage, "input_tokens"),
        output_tokens: tokenField(event.usage, "output_tokens"),
        cache_creation_input_tokens: tokenField(
          event.usage,
          "cache_creation_input_tokens",
        ),
        cache_read_input_tokens: tokenField(
          event.usage,
          "cache_read_input_tokens",
        ),
        userId: event.userId,
        workspaceId: event.workspaceId,
        costAudCents: event.costAudCents,
      }),
    );
  } catch {
    // Intentional: observability must never block the caller.
  }
}
