/**
 * Map Ascora fetch / TLS / timeout failures to actionable API responses.
 *
 * Sync previously collapsed every upstream failure into an opaque 500 via
 * fromException. Connect already surfaces TLS as 502 — keep that contract
 * consistent for sync and any shared Ascora HTTP helper.
 */

import { RetryError } from "../retry";

export type AscoraUpstreamKind = "tls" | "timeout" | "network" | "http";

export interface AscoraUpstreamFailure {
  kind: AscoraUpstreamKind;
  /** HTTP status to return to the client (502/503/504). */
  status: 502 | 503 | 504;
  message: string;
}

function unwrapError(err: unknown): Error | null {
  if (err instanceof RetryError) return err.lastError;
  if (err instanceof Error) return err;
  return null;
}

function errorText(err: Error): string {
  return `${err.name} ${err.message}`;
}

function httpStatus(err: Error): number | undefined {
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

export function isAscoraTlsError(err: unknown): boolean {
  const e = unwrapError(err);
  if (!e) return false;
  return /certificate|CERT_|SSL|TLS|unable to verify/i.test(errorText(e));
}

export function isAscoraTimeoutError(err: unknown): boolean {
  const e = unwrapError(err);
  if (!e) return false;
  if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  if (httpStatus(e) === 504) return true;
  return /aborted due to timeout|timed out|TimeoutError/i.test(errorText(e));
}

export function isAscoraNetworkError(err: unknown): boolean {
  const e = unwrapError(err);
  if (!e) return false;
  const code =
    typeof (e as { code?: unknown }).code === "string"
      ? (e as { code: string }).code
      : undefined;
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return true;
  }
  return /fetch failed|network|ECONNREFUSED|ENOTFOUND|ECONNRESET/i.test(
    errorText(e),
  );
}

/**
 * Returns a client-facing upstream failure, or null when the error should
 * fall through to the generic fromException path (e.g. Prisma bugs).
 */
export function mapAscoraUpstreamError(
  err: unknown,
): AscoraUpstreamFailure | null {
  if (isAscoraTlsError(err)) {
    return {
      kind: "tls",
      status: 502,
      message:
        "Ascora TLS certificate validation failed. This is a vendor/network trust issue — RestoreAssist will not disable TLS verification. Contact Ascora support or your network admin for a trusted certificate chain.",
    };
  }

  if (isAscoraTimeoutError(err)) {
    return {
      kind: "timeout",
      status: 504,
      message:
        "Ascora sync timed out waiting for api.ascora.com.au. The vendor API may be slow or unreachable — retry in a few minutes. If this persists, verify ASCORA_API_KEY and network access to Ascora.",
    };
  }

  const e = unwrapError(err);
  const apiStatus = e ? httpStatus(e) : undefined;

  if (apiStatus !== undefined && apiStatus >= 500) {
    return {
      kind: "http",
      status: 502,
      message:
        e?.message?.slice(0, 300) ||
        `Ascora API returned ${apiStatus}. Retry later or check Ascora status.`,
    };
  }

  if (apiStatus === 401 || apiStatus === 403) {
    return {
      kind: "http",
      status: 502,
      message:
        "Ascora rejected the API key (unauthorized). Re-connect under Integrations with a valid key from Ascora Administration → API Settings, or update ASCORA_API_KEY.",
    };
  }

  if (isAscoraNetworkError(err)) {
    return {
      kind: "network",
      status: 503,
      message:
        "Could not reach Ascora (network error). Check connectivity to api.ascora.com.au and try again.",
    };
  }

  // Messages thrown by fetchAscoraWithRetry / fetchAllPages that name Ascora.
  if (e && /Ascora/i.test(e.message)) {
    return {
      kind: "http",
      status: 502,
      message: e.message.slice(0, 400),
    };
  }

  return null;
}
