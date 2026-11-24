import { prisma } from "@/lib/prisma";

/** P5-2 — who may create/cancel job appointments (server-side). */
export function canManageAppointments(role: string | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * RA-8065: may this user manage appointments right now? Reads the role from
 * the database, never from the session.
 *
 * The role in the login cookie is only refreshed on sign-in, so a manager
 * demoted to technician keeps a MANAGER cookie for up to 90 days. Every route
 * that gates on "manager or owner" calls this, never
 * `canManageAppointments(session.user.role)`. A user row that no longer exists
 * is refused.
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
