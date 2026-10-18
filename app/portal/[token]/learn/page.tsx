import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolvePortalAccess } from "@/lib/portal/resolve-portal-inspection";
import { PortalLinkExpired } from "@/components/portal/PortalLinkExpired";
import { PortalTokenAccessFallback } from "@/components/portal/PortalTokenAccessFallback";
import { fetchPublishedPortalContent } from "@/lib/portal/fetch-portal-content";
import { fetchTechnicianIdentity } from "@/lib/portal/fetch-technician-identity";
import { isAddonEntitledForResource } from "@/lib/entitlements";
import { CLIENT_EDUCATION_SKU } from "@/lib/billing/client-education-addon";
import { PortalContentSections } from "@/components/portal/PortalContentHub";
import { ClientPortalVideos } from "@/components/portal/ClientPortalVideos";
import { TechnicianIdentityCard } from "@/components/portal/TechnicianIdentityCard";
import { ClientPortalShell } from "@/components/portal/ClientPortalShell";
import { clientPortalTextLink } from "@/lib/portal/client-portal-theme";

export const metadata: Metadata = {
  title: "About your restoration",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ClientLearnKioskPage({ params }: PageProps) {
  const { token } = await params;

  const resolved = await resolvePortalAccess(token);
  if (resolved.kind !== "inspection") {
    return <PortalTokenAccessFallback resolved={resolved} />;
  }
  const inspectionId = resolved.inspectionId;

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      userId: true,
      createdAt: true,
      technicianId: true,
      technicianName: true,
      user: {
        select: {
          organization: { select: { name: true, logoUrl: true } },
        },
      },
    },
  });
  if (!inspection) return <PortalLinkExpired />;

  const educationEntitled = await isAddonEntitledForResource(
    inspection.userId,
    inspection.createdAt,
    CLIENT_EDUCATION_SKU,
  );

  const [articles, technician] = await Promise.all([
    fetchPublishedPortalContent("customer", {
      includeAddonContent: educationEntitled,
    }).catch(() => []),
    educationEntitled
      ? fetchTechnicianIdentity(
          inspection.technicianId,
          inspection.technicianName,
          inspection.userId,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  const org = inspection.user.organization;

  return (
    <ClientPortalShell brandName={org?.name} logoUrl={org?.logoUrl}>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-white">
            About your restoration
          </h1>
          {org?.name ? (
            <p className="mt-1 text-sm text-slate-400">
              Prepared for you by {org.name}
            </p>
          ) : null}
        </div>

        {technician && <TechnicianIdentityCard technician={technician} />}

        <PortalContentSections articles={articles} />

        <ClientPortalVideos />

        <div className="pt-2 text-center">
          <Link href={`/portal/${token}`} className={clientPortalTextLink}>
            Back to job status
          </Link>
        </div>
      </div>
    </ClientPortalShell>
  );
}
