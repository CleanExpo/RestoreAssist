/**
 * RA-1460 — Client-facing Damage Report v1
 *
 * Canonical URL for the property owner to view their damage assessment.
 * Reader persona: property owner (not adjuster / not insurer).
 *
 * Auth modes:
 *   1. `?token=<insurerToken>` — HMAC-signed share link, 30-day TTL, no login required
 *   2. `getServerSession` — logged-in owner (contractor) who authored the report
 *
 * Secondary: PDF export via /api/reports/[id]/pdf (existing IICRC PDF route).
 */

import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyInsurerToken } from "@/lib/portal-token";
import { DamageReportView } from "@/components/reports/damage-report-view";

export const dynamic = "force-dynamic"; // token-based access shouldn't be cached

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: `Damage Report · ${id.slice(0, 8)}`,
    robots: { index: false, follow: false },
  };
}

export default async function ReportViewPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { token } = await searchParams;

  let authorised = false;

  if (token) {
    const verified = verifyInsurerToken(token);
    if (verified?.reportId === id) authorised = true;
  }

  if (!authorised) {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      const owns = await prisma.report.findFirst({
        where: { id, userId: session.user.id },
        select: { id: true },
      });
      if (owns) authorised = true;
    }
  }

  if (!authorised) {
    // Do not disclose whether the report exists — render a generic 404.
    notFound();
  }

  const report = await prisma.report.findUnique({
    where: { id },
    select: {
      id: true,
      reportNumber: true,
      title: true,
      status: true,
      clientName: true,
      propertyAddress: true,
      propertyPostcode: true,
      hazardType: true,
      incidentDate: true,
      inspectionDate: true,
      completionDate: true,
      waterCategory: true,
      waterClass: true,
      sourceOfWater: true,
      affectedArea: true,
      technicianName: true,
      technicianFieldReport: true,
      accessNotes: true,
      structureType: true,
      buildingAge: true,
      scopeOfWorksDocument: true,
      scopeAreas: true,
      detailedReport: true,
      totalCost: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          email: true,
          businessName: true,
          businessAddress: true,
          businessABN: true,
          businessPhone: true,
          businessEmail: true,
        },
      },
      client: {
        select: { name: true, email: true, phone: true },
      },
    },
  });

  if (!report) notFound();

  return <DamageReportView report={report} shareToken={token} />;
}
