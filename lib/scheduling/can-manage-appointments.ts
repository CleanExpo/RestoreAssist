import { prisma } from "@/lib/prisma";

/** P5-2 — who may create/cancel job appointments (server-side). */
export function canManageAppointments(role: string | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * RA-8065 — the manager/owner gate, decided from the database role.
 *
 * The session role is stamped into the login cookie at sign-in and is not
 * re-read when an owner demotes someone, so a demoted manager keeps
 * `role: "MANAGER"` in the cookie for up to 90 days. Route gates must call
 * this, never `canManageAppointments(session.user.role)`.
 */
export async function callerCanManageAppointments(
  userId: string,
): Promise<boolean> {
  const caller = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return canManageAppointments(caller?.role);
}
