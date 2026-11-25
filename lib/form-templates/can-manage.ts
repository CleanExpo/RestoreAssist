import { prisma } from "@/lib/prisma";

/**
 * RA-7957 — who may create, change or archive a form template.
 *
 * ADMIN (the business owner: every sign-up path grants it) and MANAGER may.
 * USER (an invited technician) may not. The role is re-read from the database,
 * never taken from the session: the JWT carries a role for up to 90 days and a
 * demotion does not rewrite it (.claude/RULES.md rule 3).
 */
export async function canManageFormTemplates(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === "ADMIN" || user?.role === "MANAGER";
}
