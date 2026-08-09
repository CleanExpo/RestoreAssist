import type { Session } from "next-auth";
import { assertReportTenancy } from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import {
  resolveProgressRole,
  type ProgressRole,
} from "@/lib/progress/permissions";

type ProgressAuthorityResult =
  | {
      ok: true;
      role: ProgressRole;
      user: { email: string | null; name: string | null };
    }
  | { ok: false; status: 401 | 403 | 404; reason: string };

export async function resolveProgressAuthority(
  session: Session | null,
  reportId: string,
): Promise<ProgressAuthorityResult> {
  if (!session?.user?.id) {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }
  const userId = session.user.id;

  const tenancy = await assertReportTenancy(session, reportId);
  if (!tenancy.ok) return tenancy;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isJuniorTechnician: true,
      email: true,
      name: true,
    },
  });
  if (!user) {
    return { ok: false, status: 404, reason: "Acting user not found" };
  }

  return {
    ok: true,
    role: resolveProgressRole({
      userRole: user.role,
      isJuniorTechnician: user.isJuniorTechnician ?? false,
    }),
    user: { email: user.email, name: user.name },
  };
}
