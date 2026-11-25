/**
 * RA-8495 — the organisation's job-number prefix.
 *
 * GET: any member sees the prefix and an estimate of the next number (no lock
 * is taken, so two people can see the same estimate; the save returns the
 * number actually issued).
 * PATCH: only an ADMIN of that organisation, by the role on the database row
 * (never the session token), may change the prefix. Changing it does not
 * restart the count.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { normaliseJobNumberPrefix, previewJobNumber } from "@/lib/jobs/job-number";

async function callerOrganisation(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true, role: true },
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
  }
  try {
    const user = await callerOrganisation(session.user.id);
    if (!user?.organizationId) {
      return apiError(request, {
        code: "NO_ORGANISATION",
        message: "Your account is not part of an organisation",
        status: 409,
        stage: "resolve-org",
      });
    }
    const preview = await previewJobNumber(prisma, user.organizationId);
    if (!preview) {
      return apiError(request, { code: "NOT_FOUND", message: "Organisation not found", status: 404 });
    }
    return NextResponse.json({ ...preview, canEditPrefix: user.role === "ADMIN" });
  } catch (error) {
    return fromException(request, error, { stage: "load" });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
  }
  try {
    const user = await callerOrganisation(session.user.id);
    if (!user?.organizationId) {
      return apiError(request, {
        code: "NO_ORGANISATION",
        message: "Your account is not part of an organisation",
        status: 409,
        stage: "resolve-org",
      });
    }
    // A capability the role has, never "anything but USER".
    if (user.role !== "ADMIN") {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Only an organisation admin can change the job number prefix",
        status: 403,
      });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(request, { code: "VALIDATION", message: "Invalid JSON body", status: 400 });
    }
    const prefix = normaliseJobNumberPrefix((body as { prefix?: unknown } | null)?.prefix);
    if (!prefix) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Prefix must be 2 to 10 letters or numbers",
        status: 400,
        fields: { prefix: "Use 2 to 10 letters or numbers, for example DRC" },
      });
    }
    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { jobNumberPrefix: prefix },
    });
    const preview = await previewJobNumber(prisma, user.organizationId);
    return NextResponse.json({ ...preview, canEditPrefix: true });
  } catch (error) {
    return fromException(request, error, { stage: "update" });
  }
}
