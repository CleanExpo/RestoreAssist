import { createHash } from "crypto";

/**
 * RA-8587: the address a client portal link was emailed to, kept as a hash in
 * the CLIENT_PORTAL_LINK_EMAILED audit row. A re-send compares hashes to tell
 * whether the client's email changed, without copying the address into the
 * audit log. Case and surrounding spaces are ignored.
 */
export function portalRecipientHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
