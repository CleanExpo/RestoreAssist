/**
 * Addresses RestoreAssist must never mail, mint a portal token for, or
 * record as delivered.
 *
 * Signup used to seed `sample.client@example.com.au`. That host is a
 * registrable .com.au, not RFC 2606/6761 reserved, so leftover production
 * demo rows can still point at a real inbox. We cannot rewrite those rows
 * without a GO; this check is the send-path guard. Plus-tags are stripped
 * before the exact match so `sample.client+tag@example.com.au` is refused
 * the same way.
 *
 * TLD choices (fail closed — when in doubt, suppress the send):
 * - `.invalid`, `.example`, and `.test` are RFC 6761 special-use. `.test`
 *   is blocked here even though some unit fixtures used it as a stand-in
 *   for a real recipient; those fixtures must use a registrable domain.
 * - `.local` is RFC 6762 (mDNS), not RFC 2606/6761. It is blocked only as
 *   the leftover OAuth missing-email placeholder (`@client.local`).
 * RFC 2606 `example.com` / `.net` / `.org` (and their subdomains) stay
 * blocked as reserved.
 */

const BLOCKED_ADDRESSES = new Set(["sample.client@example.com.au"]);

const RFC2606_DOMAINS = ["example.com", "example.net", "example.org"] as const;

const RFC6761_TLDS = new Set(["invalid", "example", "test"]);

/** Leftover OAuth placeholders only — not an RFC 2606/6761 reserved TLD. */
const OAUTH_PLACEHOLDER_TLDS = new Set(["local"]);

function canonicalRecipient(email: string): string {
  const normalised = email.trim().toLowerCase();
  const at = normalised.lastIndexOf("@");
  if (at < 1) return normalised;
  const local = normalised.slice(0, at);
  const domain = normalised.slice(at + 1);
  const plus = local.indexOf("+");
  const localSansTag = plus === -1 ? local : local.slice(0, plus);
  return `${localSansTag}@${domain}`;
}

export function isDemoOrReservedRecipient(email: string): boolean {
  const normalised = canonicalRecipient(email);
  if (!normalised.includes("@")) return false;
  if (BLOCKED_ADDRESSES.has(normalised)) return true;

  const domain = normalised.slice(normalised.lastIndexOf("@") + 1);
  if (!domain) return false;

  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  if (RFC6761_TLDS.has(tld) || OAUTH_PLACEHOLDER_TLDS.has(tld)) return true;

  return RFC2606_DOMAINS.some(
    (reserved) => domain === reserved || domain.endsWith(`.${reserved}`),
  );
}
