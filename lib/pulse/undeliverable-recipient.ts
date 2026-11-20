/**
 * Addresses Pulse must never mail, even when a Client row still holds them.
 *
 * Signup used to seed `sample.client@example.com.au`. That host is a
 * registrable .com.au, not RFC 2606/6761 reserved, so existing production
 * demo rows can still point at a real inbox. We cannot rewrite those rows
 * without a GO; this check is the send-path guard.
 *
 * Also cheap-blocks RFC reserved hosts so new demo/fixture/seed addresses
 * cannot be mailed even if a later seed regresses. `.test` is left off
 * the TLD list: unit fixtures use it as the stand-in for a real recipient.
 */

const BLOCKED_ADDRESSES = new Set(["sample.client@example.com.au"]);

const RFC2606_DOMAINS = ["example.com", "example.net", "example.org"] as const;

const RFC6761_TLDS = new Set(["invalid", "example"]);

export function isPulseDemoOrReservedRecipient(email: string): boolean {
  const normalised = email.trim().toLowerCase();
  if (!normalised.includes("@")) return false;
  if (BLOCKED_ADDRESSES.has(normalised)) return true;

  const domain = normalised.slice(normalised.lastIndexOf("@") + 1);
  if (!domain) return false;

  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  if (RFC6761_TLDS.has(tld)) return true;

  return RFC2606_DOMAINS.some(
    (reserved) => domain === reserved || domain.endsWith(`.${reserved}`),
  );
}
