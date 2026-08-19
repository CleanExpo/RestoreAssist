/**
 * Map Xero fetch / timeout / auth failures to actionable API responses.
 *
 * OAuth sync previously collapsed every upstream failure into an opaque 500 via
 * fromException. Mirror Ascora's upstream-errors contract so the integrations
 * UI can show a useful toast instead of "Internal server error".
 */

export type XeroUpstreamKind =
  | "timeout"
  | "auth"
  | "config"
  | "network"
  | "http";

export interface XeroUpstreamFailure {
  kind: XeroUpstreamKind;
  /** HTTP status to return to the client. */
  status: 400 | 502 | 503 | 504;
  message: string;
}

function unwrapError(err: unknown): Error | null {
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

export function isXeroTimeoutError(err: unknown): boolean {
  const e = unwrapError(err);
  if (!e) return false;
  if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  if (httpStatus(e) === 504) return true;
  return /aborted due to timeout|timed out|TimeoutError/i.test(errorText(e));
}

export function isXeroNetworkError(err: unknown): boolean {
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
 * Xero ErrorNumber 9191919 — `where` filters are rejected on high-volume
 * Contact/Invoice orgs. Sync should omit server-side where and filter locally.
 */
export function isXeroHighVolumeFilterError(err: unknown): boolean {
  const e = unwrapError(err);
  if (!e) return false;
  const text = errorText(e);
  if (/HighVolumeFilterUnavailableApiException/i.test(text)) return true;
  if (/ErrorNumber["\s:]*9191919/i.test(text)) return true;
  return (
    /9191919/.test(text) &&
    /high number of (contacts|invoices)|filter cannot be used/i.test(text)
  );
}

/**
 * Returns a client-facing upstream failure, or null when the error should
 * fall through to the generic fromException path (e.g. Prisma bugs).
 */
export function mapXeroUpstreamError(
  err: unknown,
): XeroUpstreamFailure | null {
  const e = unwrapError(err);
  const message = e?.message ?? "";

  if (/XERO_CLIENT_SECRET is not configured/i.test(message)) {
    return {
      kind: "config",
      status: 400,
      message:
        "XERO_CLIENT_SECRET is not configured. Add it to .env (required for token refresh and the Xero connect flow), then retry sync or re-connect Xero.",
    };
  }

  if (isXeroHighVolumeFilterError(err)) {
    return {
      kind: "http",
      status: 502,
      message:
        "Xero rejected a server-side contact/invoice filter because this organisation has a high volume of records (Error 9191919). RestoreAssist should sync without that filter — retry Sync. If this persists, disconnect and re-connect Xero.",
    };
  }

  if (isXeroTimeoutError(err)) {
    return {
      kind: "timeout",
      status: 504,
      message:
        "Xero sync timed out waiting for api.xero.com. The vendor API may be slow or unreachable — retry in a few minutes. If this persists, re-connect Xero under Integrations and verify network access.",
    };
  }

  if (
    /Token refresh failed|No refresh token|invalid_grant|API request failed:\s*401|API request failed:\s*403/i.test(
      message,
    )
  ) {
    return {
      kind: "auth",
      status: 502,
      message:
        "Xero rejected the access token. Re-connect Xero under Integrations. If refresh keeps failing, confirm XERO_CLIENT_ID and XERO_CLIENT_SECRET match the Xero app that issued the connection.",
    };
  }

  if (/No Xero tenant connected/i.test(message)) {
    return {
      kind: "auth",
      status: 400,
      message:
        "No Xero organisation (tenant) is linked to this connection. Disconnect and re-connect Xero, selecting an organisation when prompted.",
    };
  }

  const apiStatus = e ? httpStatus(e) : undefined;

  if (apiStatus !== undefined && apiStatus >= 500) {
    return {
      kind: "http",
      status: 502,
      message:
        e?.message?.slice(0, 300) ||
        `Xero API returned ${apiStatus}. Retry later or check Xero status.`,
    };
  }

  if (apiStatus === 401 || apiStatus === 403) {
    return {
      kind: "auth",
      status: 502,
      message:
        "Xero rejected the request (unauthorized). Re-connect under Integrations.",
    };
  }

  if (isXeroNetworkError(err)) {
    return {
      kind: "network",
      status: 503,
      message:
        "Could not reach Xero (network error). Check connectivity to api.xero.com and try again.",
    };
  }

  if (e && /Xero|API request failed|Token /i.test(e.message)) {
    return {
      kind: "http",
      status: 502,
      message: e.message.slice(0, 400),
    };
  }

  return null;
}
