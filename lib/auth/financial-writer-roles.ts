/**
 * Roles that may create money records (invoices, credit notes, recurring
 * templates, variation invoices) and spend the business's credits.
 *
 * Client-safe (no server imports) so a link to a money form can read the same
 * rule the route enforces (RA-8432). The server gate, `assertFinancialWriter`
 * in `assert-tenancy.ts`, re-reads the role from the database and calls
 * `canWriteFinancialRecords` with it.
 *
 * Tested as a capability the role HAS, never as `role !== "USER"`: the
 * negative form silently hands money to whatever role is added next.
 */
export const FINANCIAL_WRITER_ROLES: readonly string[] = ["ADMIN", "MANAGER"];

export function canWriteFinancialRecords(
  role: string | null | undefined,
): boolean {
  if (!role) return false;
  return FINANCIAL_WRITER_ROLES.includes(role);
}
