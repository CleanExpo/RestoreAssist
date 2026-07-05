import dns from "node:dns";
import net from "node:net";

/**
 * SSRF guard for server-side fetches of tenant-controlled URLs (e.g. business
 * logos embedded into exported PDFs).
 *
 * Stronger than a string-only host check: it resolves the hostname via DNS and
 * rejects the URL if ANY resolved address is private/loopback/link-local, which
 * defeats DNS-rebinding attacks where a benign-looking hostname resolves to
 * 169.254.169.254 (cloud metadata), 127.0.0.1, or an RFC1918 range.
 *
 * Reject rules:
 *  - protocol must be https:
 *  - IP-literal hostnames in a blocked range are rejected directly
 *  - hostnames are resolved (all addresses); rejected if any is blocked
 *  - unresolvable / malformed URLs are rejected (fail closed)
 */

/** True if an IPv4 dotted-quad is loopback, private, link-local, or unspecified. */
function isBlockedIpv4(addr: string): boolean {
  const parts = addr.split(".").map((p) => Number(p));
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    return true; // unparseable → fail closed
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network" / unspecified
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
  return false;
}

/** True if an IPv6 address is loopback, unspecified, ULA, link-local, or maps to a blocked IPv4. */
function isBlockedIpv6(addr: string): boolean {
  const ip = addr.toLowerCase().split("%")[0]; // strip any zone id
  if (ip === "::1") return true; // loopback
  if (ip === "::") return true; // unspecified
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]); // IPv4-mapped
  if (/^f[cd]/.test(ip)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link-local
  return false;
}

/** True if a resolved IP literal is in any blocked range (non-IP → blocked). */
function isBlockedAddress(addr: string): boolean {
  const family = net.isIP(addr);
  if (family === 4) return isBlockedIpv4(addr);
  if (family === 6) return isBlockedIpv6(addr);
  return true; // not a valid IP → fail closed
}

export async function isSafePublicHttpsUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;

  // URL wraps IPv6 literals in brackets; strip them before net.isIP.
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (!host) return false;

  // IP-literal hostname: check the range directly, no DNS needed.
  if (net.isIP(host) !== 0) {
    return !isBlockedAddress(host);
  }

  // Hostname: resolve every address and reject if ANY is blocked.
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(host, { all: true });
  } catch {
    return false;
  }
  if (addresses.length === 0) return false;
  return addresses.every((a) => !isBlockedAddress(a.address));
}
