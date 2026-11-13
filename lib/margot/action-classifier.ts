/**
 * V1 Phase 4 (P4-4) — Margot action capability matrix (server-side).
 */

export type MargotActionClass =
  | "read"
  | "draft"
  | "confirm"
  | "manager"
  | "owner"
  | "prohibited";

const PROHIBITED = new Set([
  "close_claim",
  "approve_estimate_pricing",
  "issue_invoice_without_review",
]);

export function classifyMargotAction(actionKey: string): MargotActionClass {
  if (PROHIBITED.has(actionKey)) return "prohibited";
  if (actionKey.startsWith("draft_")) return "draft";
  if (actionKey.startsWith("confirm_")) return "confirm";
  if (actionKey.startsWith("manager_")) return "manager";
  if (actionKey.startsWith("owner_")) return "owner";
  return "read";
}

export function requiresHumanConfirmation(
  actionClass: MargotActionClass,
): boolean {
  return (
    actionClass === "draft" ||
    actionClass === "confirm" ||
    actionClass === "manager" ||
    actionClass === "owner"
  );
}
