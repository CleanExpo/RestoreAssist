/**
 * Redact secret query params from any URL string before it reaches Sentry.
 * Defence in depth for B4: even though BYOK keys are now sent via headers,
 * this guarantees a key=/apiKey=/token= query param can never be recorded in
 * an HTTP span URL, request URL, or transaction name.
 */
export function scrubSecretQueryParams(value: string): string {
  return value.replace(
    /([?&](?:key|apiKey|api_key|access_token|refresh_token|token)=)[^&#\s"']+/gi,
    "$1[REDACTED]",
  );
}

type SentryEventLike = {
  request?: { url?: string };
  transaction?: string;
  spans?: Array<{ description?: string; data?: Record<string, unknown> }>;
};

/** Sentry `beforeSendTransaction`: scrub secret query params from span + request URLs. */
export function scrubTransaction<T extends SentryEventLike>(event: T): T {
  if (event?.request?.url) {
    event.request.url = scrubSecretQueryParams(event.request.url);
  }
  if (typeof event?.transaction === "string") {
    event.transaction = scrubSecretQueryParams(event.transaction);
  }
  if (Array.isArray(event?.spans)) {
    for (const span of event.spans) {
      if (typeof span?.description === "string") {
        span.description = scrubSecretQueryParams(span.description);
      }
      if (span?.data) {
        for (const key of ["http.url", "url"]) {
          const v = span.data[key];
          if (typeof v === "string") span.data[key] = scrubSecretQueryParams(v);
        }
      }
    }
  }
  return event;
}

/** Sentry `beforeSend`: scrub secret query params from an error event's request URL. */
export function scrubErrorEvent<T extends SentryEventLike>(event: T): T {
  if (event?.request?.url) {
    event.request.url = scrubSecretQueryParams(event.request.url);
  }
  return event;
}
