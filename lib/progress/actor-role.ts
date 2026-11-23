import { prisma } from "@/lib/prisma";
import { resolveProgressRole, type ProgressRole } from "./permissions";

/**
 * RA-8067: the caller's current role, read from the database and converted
 * to the progress vocabulary, for stamping `ProgressTransition.actorRole`.
 *
 * Never use `session.user.role` for that column: the login cookie can carry
 * a role up to 90 days stale after a promotion or demotion, and it is in the
 * account vocabulary (`USER`), not the progress one (`TECHNICIAN`).
 *
 * Returns null when the user row no longer exists; callers refuse with 403.
 */
export async function loadActorProgressRole(
  userId: string,
): Promise<ProgressRole | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isJuniorTechnician: true },
  });
  if (!user) return null;
  return resolveProgressRole({
    userRole: user.role,
    isJuniorTechnician: user.isJuniorTechnician,
  });
}
