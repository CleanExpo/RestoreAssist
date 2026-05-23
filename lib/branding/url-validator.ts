/**
 * Validates a user-supplied URL is safe for server-side fetching.
 * Blocks: non-http(s) schemes, loopback, link-local, RFC1918, broadcast.
 */
export function isPublicHttpUrl(
  input: string,
): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http(s) URLs allowed" };
  }

  const host = url.hostname.toLowerCase();

  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return { ok: false, reason: "Loopback addresses not allowed" };
  }

  if (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
  ) {
    return { ok: false, reason: "Private IP ranges not allowed" };
  }

  if (/^169\.254\./.test(host)) {
    return { ok: false, reason: "Link-local addresses not allowed" };
  }

  if (host === "0.0.0.0") {
    return { ok: false, reason: "Broadcast address not allowed" };
  }

  return { ok: true, url };
}
