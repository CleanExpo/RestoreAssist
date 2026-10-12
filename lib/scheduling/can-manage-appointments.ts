/** P5-2 — who may create/cancel job appointments (server-side). */
export function canManageAppointments(role: string | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
