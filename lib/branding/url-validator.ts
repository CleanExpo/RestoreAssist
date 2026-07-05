/**
 * Validates a user-supplied URL is safe for server-side fetching.
 * Blocks: non-http(s) schemes, loopback, link-local, RFC1918, broadcast,
 * IPv6 unique-local/link-local, and *.internal hostnames.
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

  // URL.hostname keeps the brackets on IPv6 literals (e.g. "[fd00::1]"); strip
  // them so the address checks below see the bare address.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || /^127\./.test(host) || host === "::1") {
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

  // IPv6 unique-local (fc00::/7 → fc/fd prefixes) and link-local (fe80::/10).
  if (host.includes(":") && (/^f[cd]/.test(host) || /^fe[89ab]/.test(host))) {
    return { ok: false, reason: "IPv6 private/link-local addresses not allowed" };
  }

  if (host === "0.0.0.0") {
    return { ok: false, reason: "Broadcast address not allowed" };
  }

  if (host === "internal" || host.endsWith(".internal")) {
    return { ok: false, reason: "Internal hostnames not allowed" };
  }

  return { ok: true, url };
}
