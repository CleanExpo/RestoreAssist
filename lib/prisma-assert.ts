/**
 * RA-1306 — helpers to stop `updateMany` / `deleteMany` silently succeeding
 * when zero rows matched.
 *
 * `updateMany({ where: { stripeCustomerId } })` returns `{ count: 0 }` if no
 * user matched. Historically many paths ignored that — a Stripe payment could
 * fire an activation update, no user row matched the customerId, and the
 * webhook responded 200 while the user's subscription stayed inactive.
 *
 * Usage:
 *
 *   const result = await prisma.user.updateMany({ where, data });
 *   assertRowsUpdated(result, "stripe.activateSubscription", {
 *     stripeCustomerId: customerId,
 *   });
 *
 * The helper logs a structured error (op, ctx, count) so ops can alert on
 * `RowsUpdated=0` in production. Callers that *intend* best-effort semantics
 * (e.g. marking an audit row as SKIPPED) should NOT use this helper — add a
 * comment marking the intent instead.
 */

export interface AffectedRows {
  count: number;
}

export class NoRowsAffectedError extends Error {
  readonly op: string;
  readonly context: Record<string, unknown>;

  constructor(op: string, context: Record<string, unknown>) {
    super(
      `[${op}] updateMany/deleteMany affected 0 rows — no row matched the where clause. Context: ${JSON.stringify(context)}`,
    );
    this.name = "NoRowsAffectedError";
    this.op = op;
    this.context = context;
  }
}

/**
 * Throws NoRowsAffectedError when the Prisma updateMany/deleteMany result's
 * count is 0. The error is catchable if the caller wants to degrade to
 * best-effort; the point is that it's explicit rather than silent.
 */
export function assertRowsUpdated(
  result: AffectedRows,
  op: string,
  context: Record<string, unknown> = {},
): void {
  if (result.count === 0) {
    const err = new NoRowsAffectedError(op, context);
    console.error(err.message);
    throw err;
  }
}

/**
 * Non-throwing variant — logs a structured warning when zero rows were
 * affected. Use for paths where ops should investigate but a throw would
 * block a critical flow (e.g. the outer Stripe webhook response).
 */
export function warnIfZeroRows(
  result: AffectedRows,
  op: string,
  context: Record<string, unknown> = {},
): void {
  if (result.count === 0) {
    console.error(
      `[${op}] updateMany/deleteMany affected 0 rows (warning, not fatal). Context: ${JSON.stringify(context)}`,
    );
  }
}
