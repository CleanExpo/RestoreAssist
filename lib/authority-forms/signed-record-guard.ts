/**
 * RA-8400 — one owner for "a signed authority form is a closed legal record".
 *
 * An authority form is the client's written consent. Its PDF is rendered on
 * demand from the database row (see lib/documents/render-authority-form.ts),
 * so any later change to the row appears above the client's old signature.
 * Every route that writes AuthorityFormInstance or AuthorityFormSignature
 * takes its rule from here; the writer allow-list test in
 * lib/authority-forms/__tests__/signed-record-guard.test.ts fails when a new
 * writer under app/api skips this module.
 *
 * Each rule has two halves that must agree:
 *   - a check on a row already read (gives the caller a clear 409), and
 *   - a Prisma where fragment placed in the write itself, so a signature or
 *     status change that lands between the read and the write still blocks it.
 */

import type { AuthorityFormStatus } from "@prisma/client";

/** A form in one of these states takes no new signature and no new slot. */
export const CLOSED_FORM_STATUSES: readonly AuthorityFormStatus[] = [
  "CANCELLED",
  "COMPLETED",
];

/**
 * Status moves a staff member may request through PUT /api/authority-forms/:id.
 * PARTIALLY_SIGNED and COMPLETED are set only by the signing routes, never by
 * the request body. Cancelling a form that already carries a signature is a
 * founder decision not yet taken (RA-8400 open question), so it is not listed.
 */
export const STAFF_STATUS_MOVES: Readonly<
  Partial<Record<AuthorityFormStatus, readonly AuthorityFormStatus[]>>
> = {
  DRAFT: ["CANCELLED"],
  PENDING_SIGNATURES: ["CANCELLED"],
};

/** Where fragment for AuthorityFormInstance: the form still accepts signatures. */
export function formAcceptsSignatureWhere() {
  return { status: { notIn: [...CLOSED_FORM_STATUSES] } };
}

/** Where fragment for AuthorityFormSignature: the slot has not been signed. */
export function unsignedSlotWhere() {
  return { signedAt: null };
}

/** Where fragment for AuthorityFormInstance: no signature on it is signed. */
export function noSignedSignatureWhere() {
  return { signatures: { none: { signedAt: { not: null } } } };
}

/** Returns the reason a form cannot take a signature or new slot, or null. */
export function formSignatureRefusal(form: {
  status: AuthorityFormStatus | string;
}): string | null {
  if ((CLOSED_FORM_STATUSES as readonly string[]).includes(form.status)) {
    return form.status === "CANCELLED"
      ? "This form has been cancelled and can no longer be signed"
      : "This form is already complete and can no longer be signed";
  }
  return null;
}

/**
 * Returns the reason a signed form cannot be edited by staff (wording or
 * status), or null.
 */
export function formTextEditRefusal(form: {
  signatures: ReadonlyArray<{ signedAt: Date | string | null }>;
}): string | null {
  if (form.signatures.some((s) => s.signedAt !== null)) {
    return "This form has been signed and can no longer be changed";
  }
  return null;
}

/** Returns the reason a staff status change is refused, or null. */
export function statusMoveRefusal(
  from: AuthorityFormStatus | string,
  to: unknown,
): string | null {
  const allowed = STAFF_STATUS_MOVES[from as AuthorityFormStatus] ?? [];
  if (typeof to === "string" && (allowed as readonly string[]).includes(to)) {
    return null;
  }
  return `Status cannot be changed from ${from} to ${String(to)}`;
}
