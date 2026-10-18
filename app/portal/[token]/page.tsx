import { resolvePortalAccess } from "@/lib/portal/resolve-portal-inspection";
import { PortalLinkExpired } from "@/components/portal/PortalLinkExpired";
import { PortalTokenAccessFallback } from "@/components/portal/PortalTokenAccessFallback";
import { prisma } from "@/lib/prisma";
import { ClientPortalVideos } from "@/components/portal/ClientPortalVideos";
import { ClientPortalUpload } from "@/components/portal/ClientPortalUpload";
import { ClientPortalAuthorities } from "@/components/portal/ClientPortalAuthorities";
import { ClientPortalLiveHub } from "@/components/portal/ClientPortalLiveHub";
import { PORTAL_SECTION_IDS } from "@/lib/portal/portal-section-ids";
import {
  PortalAboutSection,
  PortalContentSections,
} from "@/components/portal/PortalContentHub";
import { fetchPublishedPortalContent } from "@/lib/portal/fetch-portal-content";
import { isAddonEntitledForResource } from "@/lib/entitlements";
import { CLIENT_EDUCATION_SKU } from "@/lib/billing/client-education-addon";
import { fetchTechnicianIdentity } from "@/lib/portal/fetch-technician-identity";
import { TechnicianIdentityCard } from "@/components/portal/TechnicianIdentityCard";
import { PortalAffectedAreas } from "@/components/portal/PortalAffectedAreas";
import {
  PORTAL_AFFECTED_AREAS_INCLUDE,
  toPortalAffectedAreaItems,
} from "@/lib/portal/portal-affected-areas";
import {
  ClientPortalPropertyCard,
  ClientPortalShell,
} from "@/components/portal/ClientPortalShell";
import { ClientPortalReportReady } from "@/components/portal/ClientPortalReportReady";
import { ClientPortalPanel } from "@/components/portal/ClientPortalPanel";
import { clientPortalPanelPadding } from "@/lib/portal/client-portal-theme";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ClientPortalPage({ params }: PageProps) {
  const { token } = await params;

  const resolved = await resolvePortalAccess(token);
  if (resolved.kind !== "inspection") {
    return <PortalTokenAccessFallback resolved={resolved} />;
  }
  const inspectionId = resolved.inspectionId;
  const showInteractiveActions = resolved.accessMode === "INTERACTIVE";

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      affectedAreas: PORTAL_AFFECTED_AREAS_INCLUDE,
      scopeItems: {
        where: { isSelected: true },
        select: {
          id: true,
          description: true,
        },
        orderBy: { createdAt: "asc" },
      },
      report: {
        select: { status: true, id: true },
      },
      user: {
        select: {
          organization: {
            select: {
              name: true,
              logoUrl: true,
              aboutCopy: true,
            },
          },
        },
      },
    },
  });

  if (!inspection) {
    return <PortalLinkExpired />;
  }

  const reportReady = inspection.report?.status === "COMPLETED";

  const educationEntitled = await isAddonEntitledForResource(
    inspection.userId,
    inspection.createdAt,
    CLIENT_EDUCATION_SKU,
  );

  const portalArticles = await fetchPublishedPortalContent("customer", {
    includeAddonContent: educationEntitled,
  }).catch(() => []);

  const technician = educationEntitled
    ? await fetchTechnicianIdentity(
        inspection.technicianId,
        inspection.technicianName,
        inspection.userId,
      ).catch(() => null)
    : null;

  const org = inspection.user.organization;

  const inspectionDate = new Date(inspection.createdAt).toLocaleDateString(
    "en-AU",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
    },
  );

  return (
    <ClientPortalShell
      brandName={org?.name}
      logoUrl={org?.logoUrl}
      inspectionNumber={inspection.inspectionNumber}
      inspectionDate={inspectionDate}
    >
      <ClientPortalPropertyCard
        address={inspection.propertyAddress}
        technicianName={inspection.technicianName}
      />

      <ClientPortalLiveHub
        token={token}
        interactive={showInteractiveActions}
        reportPdfHref={
          reportReady
            ? `/api/portal/${encodeURIComponent(token)}/pdf`
            : undefined
        }
      />

      {!showInteractiveActions && (
        <ClientPortalPanel role="status">
          <p className="text-sm font-semibold text-white/90">View only</p>
          <p className="mt-1 text-sm text-slate-400">
            This link cannot be used to upload or sign. Ask your restoration
            team for a new link if you need to respond on this job.
          </p>
        </ClientPortalPanel>
      )}

      {showInteractiveActions && (
        <div id={PORTAL_SECTION_IDS.approvals} className="scroll-mt-6">
          <ClientPortalAuthorities token={token} />
        </div>
      )}

      <PortalAffectedAreas
        areas={toPortalAffectedAreaItems(inspection.affectedAreas)}
      />

      {inspection.scopeItems.length > 0 && (
        <div className={clientPortalPanelPadding}>
          <h2 className="text-sm font-semibold text-white/90">
            Scope of works
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({inspection.scopeItems.length}{" "}
              {inspection.scopeItems.length === 1 ? "item" : "items"})
            </span>
          </h2>
          <ul className="mt-3 space-y-2">
            {inspection.scopeItems.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 text-sm text-slate-300"
              >
                <svg
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{item.description?.trim() || "Restoration work item"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reportReady && (
        <div id={PORTAL_SECTION_IDS.report} className="scroll-mt-6">
          <ClientPortalReportReady token={token} />
        </div>
      )}

      {showInteractiveActions && (
        <div id={PORTAL_SECTION_IDS.upload} className="scroll-mt-6">
          <ClientPortalUpload token={token} />
        </div>
      )}

      {technician && <TechnicianIdentityCard technician={technician} />}

      <PortalAboutSection
        logoUrl={org?.logoUrl}
        aboutCopy={org?.aboutCopy}
        orgName={org?.name}
      />

      <PortalContentSections articles={portalArticles} />

      <ClientPortalVideos />
    </ClientPortalShell>
  );
}
