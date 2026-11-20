/**
 * RA-8273 — the one rule for "may this invoice be changed?".
 *
 * An invoice is edited only while DRAFT, and deleted only while DRAFT or
 * CANCELLED (never after it has been issued to the customer). The status is
 * read here, under `SELECT ... FOR UPDATE` on the invoice row, inside the same
 * transaction that then writes. A status read before the transaction can be
 * stale by the time the lock is granted: a second connection may have
 * committed SENT in between. That gap let a stale draft edit replace the lines
 * of an invoice the customer already held (D-025 locked the row but never
 * looked at the status again).
 *
 * Every route that edits or deletes an invoice calls this first inside its
 * transaction and writes only if it returns. Do not check `isDraft` on a row
 * read outside the transaction and treat that as the gate; it is only a fast
 * early answer.
 */
import { Prisma } from "@prisma/client";
import { isCancelled, isDraft } from "@/lib/invoice-status";

export type InvoiceMutation = "edit" | "delete";

const MAY_MUTATE: Record<InvoiceMutation, (status: string) => boolean> = {
  edit: isDraft,
  delete: (status) => isDraft(status) || isCancelled(status),
};

/**
 * Thrown inside the transaction, so it rolls back. `status` is the status read
 * under the lock, or null when the invoice no longer exists for this owner.
 */
export class InvoiceNotMutableError extends Error {
  constructor(
    readonly mutation: InvoiceMutation,
    readonly status: string | null,
  ) {
    super(
      status === null
        ? "Invoice not found"
        : `Invoice in status ${status} cannot be ${mutation === "edit" ? "edited" : "deleted"}`,
    );
    this.name = "InvoiceNotMutableError";
  }
}

export async function lockInvoiceForMutation(
  tx: Prisma.TransactionClient,
  args: { id: string; userId: string; mutation: InvoiceMutation },
): Promise<{ status: string }> {
  const rows = await tx.$queryRaw<Array<{ status: string }>>(
    Prisma.sql`SELECT "status"::text AS "status" FROM "Invoice" WHERE "id" = ${args.id} AND "userId" = ${args.userId} FOR UPDATE`,
  );
  const status = rows[0]?.status ?? null;
  if (status === null || !MAY_MUTATE[args.mutation](status)) {
    throw new InvoiceNotMutableError(args.mutation, status);
  }
  return { status };
}
