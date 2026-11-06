/**
 * Addresses RestoreAssist must never mail, mint a portal token for, or
 * record as delivered.
 *
 * Signup used to seed `sample.client@example.com.au`. That host is a
 * registrable .com.au, not RFC 2606/6761 reserved, so leftover production
 * demo rows can still point at a real inbox. We cannot rewrite those rows
 * without a GO; this check is the send-path guard.
 *
 * Also cheap-blocks RFC reserved hosts and the OAuth missing-email
 * placeholder TLD (`.local`) so demo/fixture/import addresses cannot be
 * mailed. `.test` is left off: unit fixtures use it as the stand-in for a
 * real recipient.
 */

const BLOCKED_ADDRESSES = new Set(["sample.client@example.com.au"]);

const RFC2606_DOMAINS = ["example.com", "example.net", "example.org"] as const;

const BLOCKED_TLDS = new Set([
  "invalid", // RFC 6761
  "example", // RFC 6761
  "local", // RFC 6762; leftover OAuth placeholders were @client.local
]);

export function isDemoOrReservedRecipient(email: string): boolean {
  const normalised = email.trim().toLowerCase();
  if (!normalised.includes("@")) return false;
  if (BLOCKED_ADDRESSES.has(normalised)) return true;

  const domain = normalised.slice(normalised.lastIndexOf("@") + 1);
  if (!domain) return false;

  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  if (BLOCKED_TLDS.has(tld)) return true;

  return RFC2606_DOMAINS.some(
    (reserved) => domain === reserved || domain.endsWith(`.${reserved}`),
  );
}
