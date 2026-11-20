/**
 * Wave 1 (W1-3): technicians must not email client/insurer reports without
 * manager or admin involvement (RA-8184 / S3-2).
 */

export const MANAGER_SEND_REFUSAL_MESSAGE =
  "Only a manager or admin can email this report to the client. Ask your manager to send it from the dashboard.";

/** `USER` is the field technician role in this product. */
export function blocksReportSendForTechnicianRole(
  role: string | null | undefined,
): boolean {
  return role === "USER";
}