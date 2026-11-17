/**
 * RA-8438 — the one owner of "what status follows from these signatures".
 *
 * Before this module three routes each held their own copy of the rule and
 * wrote the status in a separate call after the signature. A form signed in
 * person stayed "Sent", a failed status write left a fully signed form short
 * of COMPLETED, and a racing signer could move COMPLETED back to
 * PARTIALLY_SIGNED.
 *
 * Callers write the signature and then call `settleAuthorityFormStatus` with
 * the same transaction client, inside `prisma.$transaction`, so both land or
 * neither does. The status write is conditional: its WHERE clause is the set
 * of statuses this rule would move to the target, so a concurrent COMPLETED
 * or CANCELLED is never overwritten.
 */

import type { AuthorityFormStatus, Prisma } from "@prisma/client";

export type AuthorityFormStatusValue = `${AuthorityFormStatus}`;

export const AUTHORITY_FORM_STATUSES = [
  "DRAFT",
  "PENDING_SIGNATURES",
  "PARTIALLY_SIGNED",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly AuthorityFormStatusValue[];

/** Statuses a signature can never move: terminal records. */
const TERMINAL: ReadonlySet<AuthorityFormStatusValue> = new Set([
  "COMPLETED",
  "CANCELLED",
]);

export interface SignatureCounts {
  /** Signatory slots on the form. */
  total: number;
  /** Slots with a signature recorded. */
  signed: number;
}

/**
 * The status a form should hold given its current status and signatures.
 * Never moves COMPLETED or CANCELLED; never moves a form backwards.
 */
export function deriveAuthorityFormStatus(
  current: AuthorityFormStatusValue,
  { total, signed }: SignatureCounts,
): AuthorityFormStatusValue {
  if (TERMINAL.has(current)) return current;
  if (total > 0 && signed >= total) return "COMPLETED";
  if (signed > 0) return "PARTIALLY_SIGNED";
  return current;
}

/** Every status this rule would move to `target` given these counts. */
function statusesMovingTo(
  target: AuthorityFormStatusValue,
  counts: SignatureCounts,
): AuthorityFormStatusValue[] {
  return AUTHORITY_FORM_STATUSES.filter(
    (s) => s !== target && deriveAuthorityFormStatus(s, counts) === target,
  );
}

type StatusTx = Pick<
  Prisma.TransactionClient,
  "authorityFormSignature" | "authorityFormInstance"
>;

/**
 * Recount the form's signatures and move its status forward if the rule says
 * so. Call with the transaction client that wrote the signature.
 */
export async function settleAuthorityFormStatus(
  tx: StatusTx,
  instanceId: string,
): Promise<{ allSigned: boolean }> {
  // Sequential: an interactive transaction runs on one connection.
  const total = await tx.authorityFormSignature.count({ where: { instanceId } });
  const unsigned = await tx.authorityFormSignature.count({
    where: { instanceId, signedAt: null },
  });
  const counts: SignatureCounts = { total, signed: total - unsigned };
  const allSigned = total > 0 && unsigned === 0;

  const target: AuthorityFormStatusValue | null = allSigned
    ? "COMPLETED"
    : counts.signed > 0
      ? "PARTIALLY_SIGNED"
      : null;
  if (!target) return { allSigned };

  await tx.authorityFormInstance.updateMany({
    where: {
      id: instanceId,
      status: { in: statusesMovingTo(target, counts) },
    },
    data:
      target === "COMPLETED"
        ? { status: target, completedAt: new Date() }
        : { status: target },
  });

  return { allSigned };
}
