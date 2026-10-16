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

// The parent `[token]/layout.tsx` already sets noindex and, since metadata
// merges per-key with the deepest segment winning, this page inherits it. It is
// restated here anyway: this is the page most likely to end up on a screen in
// someone's living room, read over a shoulder and typed into a browser, and the
// cost of the guarantee being local is one object literal.
export const metadata: Metadata = {
  title: "About your restoration",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * The handover tablet.
 *
 * A technician hands this to the homeowner and gets back to work. It is the same
 * content as the portal's explainer sections, full-screen and stripped of the
 * job chrome — no status timeline, no upload box, no authorities to sign —
 * because someone reading it is trying to understand the process, not action
 * their claim.
 *
 * Entitlement behaves exactly as it does on the portal: fail closed to the free
 * article set, and never an upsell. The client is not the buyer. A thinner page
 * is a fine outcome; a message about their restorer's billing is not.
 */
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

  // RA-7893: the job's creator may be an invited technician; the add-on is
  // the owner's of the business the JOB belongs to, which is not the
  // creator's current one if they have since moved. Fails closed to the free
  // set.
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
          <Link
            href={`/portal/${token}`}
            className="text-sm text-cyan-400/90 underline underline-offset-2 hover:text-cyan-300"
          >
            Back to your job status
          </Link>
        </div>
      </div>
    </ClientPortalShell>
  );
}
