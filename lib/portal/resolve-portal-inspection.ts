import { portalInspectionWhere } from "@/lib/portal/portal-inspection-scope";
import { verifyPortalToken } from "@/lib/portal-token";
import {
  lookupPortalAccount,
  type PortalAccessMode,
} from "@/lib/portal/lookup-portal-account";
import { prisma } from "@/lib/prisma";

export type PortalAccessResolution =
  | { kind: "inspection"; inspectionId: string; accessMode: PortalAccessMode }
  | { kind: "unready" }
  | { kind: "invalid" };

export async function resolvePortalAccess(
  token: string,
): Promise<PortalAccessResolution> {
  const portalAccount = await lookupPortalAccount(token);
  if (portalAccount) {
    const inspection = await prisma.inspection.findFirst({
      where: portalInspectionWhere(portalAccount),
      ...(portalAccount.inspectionId
        ? {}
        : { orderBy: { createdAt: "desc" as const } }),
      select: { id: true },
    });
    if (inspection?.id) {
      return {
        kind: "inspection",
        inspectionId: inspection.id,
        accessMode: portalAccount.accessMode,
      };
    }
    return { kind: "unready" };
  }

  const verified = verifyPortalToken(token);
  if (verified?.inspectionId) {
    return {
      kind: "inspection",
      inspectionId: verified.inspectionId,
      accessMode: "READ_ONLY",
    };
  }
  return { kind: "invalid" };
}

export async function resolvePortalInspectionId(
  token: string,
): Promise<string | null> {
  const resolved = await resolvePortalAccess(token);
  return resolved.kind === "inspection" ? resolved.inspectionId : null;
}
