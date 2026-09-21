/**
 * Estimate workflow statuses and the transitions between them.
 *
 * Single source of truth, shared by the status route
 * (`app/api/estimates/[id]/status/route.ts`), which enforces it, and the
 * status buttons (`components/EstimateStatusWorkflow.tsx`), which offer only
 * what it allows. Moved here verbatim from the route (RA-7633) so the two
 * cannot drift apart. Pure constants: no server imports, safe for the client.
 */

export const ALLOWED_STATUSES = [
  "DRAFT",
  "INTERNAL_REVIEW",
  "SENT",
  "CLIENT_REVIEW",
  "APPROVED",
  "LOCKED",
  "REJECTED",
  "EXPIRED",
  "WITHDRAWN",
] as const;

export type EstimateStatus = (typeof ALLOWED_STATUSES)[number];

export const LEGAL_TRANSITIONS: Record<
  EstimateStatus,
  readonly EstimateStatus[]
> = {
  DRAFT: ["INTERNAL_REVIEW", "WITHDRAWN"],
  INTERNAL_REVIEW: ["DRAFT", "SENT", "WITHDRAWN"],
  SENT: ["CLIENT_REVIEW", "EXPIRED", "WITHDRAWN"],
  CLIENT_REVIEW: ["APPROVED", "REJECTED", "EXPIRED", "WITHDRAWN"],
  APPROVED: ["LOCKED"],
  LOCKED: [],
  REJECTED: [],
  EXPIRED: [],
  WITHDRAWN: [],
};

export function isEstimateStatus(v: unknown): v is EstimateStatus {
  return (
    typeof v === "string" && (ALLOWED_STATUSES as readonly string[]).includes(v)
  );
}
