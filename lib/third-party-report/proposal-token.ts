/**
 * RA-7687 slice 1 - the signed proposal.
 *
 * The extract route holds nothing in a table. It signs what the model proposed
 * (document facts, pages, hash) so the confirm route can tell that the facts
 * it is asked to write are the ones that were read from that report, for that
 * job and user, recently. A client cannot invent a "from page 4 of the lab
 * report" fact and have it audited as if it were one. Signed with a key
 * derived from NEXTAUTH_SECRET under its own label (HMAC(secret, label), never
 * the raw secret, so it cannot be valid as or forgeable from a session token);
 * the payload binds user, inspection (which fixes the tenant), report SHA-256
 * and an expiry; the route re-checks tenancy on confirm. No new secret.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { readEnv } from "@/lib/env";
import type { ExtractedDocument, ExtractedFact } from "./schema";

export const PROPOSAL_TTL_MS = 2 * 60 * 60 * 1000;
const LABEL = "ra7687-third-party-report-proposal-v1";

export interface ProposalPayload {
  inspectionId: string;
  userId: string;
  sha256: string;
  fileName: string;
  document: ExtractedDocument;
  facts: ExtractedFact[];
  /** Expiry, epoch milliseconds. */
  exp: number;
}

function key(): Buffer {
  const secret = readEnv("NEXTAUTH_SECRET");
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to sign proposals");
  return createHmac("sha256", secret).update(LABEL).digest();
}

const mac = (body: string) =>
  createHmac("sha256", key()).update(body).digest("base64url");

export function signProposal(payload: ProposalPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${mac(body)}`;
}

export type VerifyResult =
  | { ok: true; payload: ProposalPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_job" | "wrong_user" };

export function verifyProposal(
  token: string,
  expect: { inspectionId: string; userId: string; now?: number },
): VerifyResult {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "malformed" };
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return { ok: false, reason: "bad_signature" };
  }
  let payload: ProposalPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || !Array.isArray(payload.facts)) return { ok: false, reason: "malformed" };
  if (typeof payload.exp !== "number" || payload.exp < (expect.now ?? Date.now())) {
    return { ok: false, reason: "expired" };
  }
  if (payload.inspectionId !== expect.inspectionId) return { ok: false, reason: "wrong_job" };
  if (payload.userId !== expect.userId) return { ok: false, reason: "wrong_user" };
  return { ok: true, payload };
}
