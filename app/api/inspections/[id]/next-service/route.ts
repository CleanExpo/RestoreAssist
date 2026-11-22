import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionReadable } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { getAppUrl } from "@/lib/app-url";
import {
  draftNextServiceFollowUp,
  nextServicesFor,
  parseServicesOffered,
} from "@/lib/crm/service-catalogue";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * RA-8220: the "next service" follow-up for a job. Read-only; it drafts text for
 * the technician to review and send, and sends nothing itself.
 *
 * The services come from the business owner's contractor profile: the
 * workspace owner when the job belongs to a workspace, else the job's owner.
 *
 * RA-8531: opened with the D-023 read reach (`assertInspectionReadable`), not
 * the write gate, so a colleague in the job owner's organisation can read it.
 * Another organisation still gets the same opaque 404 as a missing job.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    }
    const { id } = await context.params;
    const tenancy = await assertInspectionReadable(session, id);
    if (!tenancy.ok) {
      return NextResponse.json({ error: tenancy.reason }, { status: tenancy.status });
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: {
        claimType: true,
        client: { select: { name: true, contactPerson: true } },
        workspace: { select: { ownerId: true } },
      },
    });
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }

    const ownerId = inspection.workspace?.ownerId ?? tenancy.data.userId;
    const [profile, owner] = await Promise.all([
      prisma.contractorProfile.findUnique({
        where: { userId: ownerId },
        select: { slug: true, servicesOffered: true, isPubliclyVisible: true },
      }),
      prisma.user.findUnique({ where: { id: ownerId }, select: { businessName: true } }),
    ]);

    const offered = parseServicesOffered(profile?.servicesOffered);
    const services = nextServicesFor(inspection.claimType, offered);
    const businessCardUrl =
      profile?.slug && profile.isPubliclyVisible
        ? `${getAppUrl().replace(/\/$/, "")}/contractors/${encodeURIComponent(profile.slug)}`
        : null;
    const draft = draftNextServiceFollowUp({
      clientName: inspection.client?.contactPerson || inspection.client?.name,
      businessName: owner?.businessName?.trim() || "Our team",
      services,
      businessCardUrl,
    });

    return NextResponse.json({
      hasCatalogue: offered.services.length > 0,
      services: services.map((s) => ({ id: s.id, label: s.label })),
      businessCardUrl,
      draft,
    });
  } catch (error) {
    return fromException(request, error);
  }
}
