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

import type { AuthorityFormStatus, Prisma } from "@prisma/client";

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
 * Returns the reason a form takes no NEW signatory slot: it is closed, or
 * somebody has already signed it (a new slot would appear on the executed
 * document, which is rendered from the live rows).
 */
export function formNewSlotRefusal(form: {
  status: AuthorityFormStatus | string;
  signatures: ReadonlyArray<{ signedAt: Date | string | null }>;
}): string | null {
  return (
    formSignatureRefusal(form) ??
    (form.signatures.some((s) => s.signedAt !== null)
      ? "This form has been signed and can no longer take a new signatory"
      : null)
  );
}

/**
 * Returns the reason a signed form cannot be edited by staff (wording or
 * status) or deleted, or null.
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

// ---------------------------------------------------------------------------
// RA-8526 — deletes that reach a signed form through the database cascade.
//
// AuthorityFormInstance is onDelete: Cascade from Report, and Report is
// onDelete: Cascade from User. A Report or User delete therefore erases
// every form and signature under it without naming either form model.
// Every delete of a cascade ancestor takes its rule from here; the allow-list
// test derives the ancestors from prisma/schema.prisma, so a new cascade
// parent or a new deleter fails that test until it calls this module.
// ---------------------------------------------------------------------------

/** Where fragment for AuthorityFormInstance: at least one signature is signed. */
export function signedFormWhere() {
  return { signatures: { some: { signedAt: { not: null } } } };
}

/**
 * Where fragment for Report: it holds no signed authority form. Placed in
 * every report delete so a signature that lands after the check still
 * blocks the delete.
 */
export function reportHoldsNoSignedFormWhere() {
  return { authorityForms: { none: signedFormWhere() } };
}

export const SIGNED_FORM_CASCADE_REFUSAL =
  "This report holds a signed authority form. A signed authority form is the client's legal consent and cannot be deleted, so the report cannot be deleted either";

/** Thrown inside a transaction when a delete would cascade into a signed form. */
export class SignedFormCascadeError extends Error {
  constructor(readonly reportIds: string[]) {
    super(SIGNED_FORM_CASCADE_REFUSAL);
    this.name = "SignedFormCascadeError";
  }
}

/** The one read every cascade deleter runs (prisma or a transaction client). */
export type SignedFormReader = Pick<Prisma.TransactionClient, "authorityFormInstance">;

/**
 * Returns the ids of reports matched by `reportWhere` that hold a signed
 * authority form (at most 100). Empty means the delete may go ahead.
 */
export async function reportsHoldingSignedForms(
  db: SignedFormReader,
  reportWhere: Prisma.ReportWhereInput,
): Promise<string[]> {
  const rows = await db.authorityFormInstance.findMany({
    where: { report: reportWhere, ...signedFormWhere() },
    select: { reportId: true },
    distinct: ["reportId"],
    take: 100,
  });
  return rows.map((r) => r.reportId);
}

/** Throws SignedFormCascadeError when any matched report holds a signed form. */
export async function assertNoSignedFormCascade(
  db: SignedFormReader,
  reportWhere: Prisma.ReportWhereInput,
): Promise<void> {
  const held = await reportsHoldingSignedForms(db, reportWhere);
  if (held.length > 0) throw new SignedFormCascadeError(held);
}
