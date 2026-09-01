import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolvePortalInspectionId } from "@/lib/portal/resolve-portal-inspection";
import { fetchPublishedPortalContent } from "@/lib/portal/fetch-portal-content";
import { fetchTechnicianIdentity } from "@/lib/portal/fetch-technician-identity";
import { requireAddonForWorkspace } from "@/lib/entitlements";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { CLIENT_EDUCATION_SKU } from "@/lib/billing/client-education-addon";
import { PortalContentSections } from "@/components/portal/PortalContentHub";
import { ClientPortalVideos } from "@/components/portal/ClientPortalVideos";
import { TechnicianIdentityCard } from "@/components/portal/TechnicianIdentityCard";

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

  const inspectionId = await resolvePortalInspectionId(token);
  if (!inspectionId) notFound();

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      userId: true,
      technicianId: true,
      technicianName: true,
      user: {
        select: {
          organization: { select: { name: true, logoUrl: true } },
        },
      },
    },
  });
  if (!inspection) notFound();

  const educationEntitled = await (async () => {
    try {
      const workspace = await getWorkspaceForUser(inspection.userId);
      if (!workspace) return false;
      const gate = await requireAddonForWorkspace(
        workspace.id,
        CLIENT_EDUCATION_SKU,
      );
      return gate.allowed;
    } catch {
      return false;
    }
  })();

  const [articles, technician] = await Promise.all([
    fetchPublishedPortalContent("customer", {
      includeAddonContent: educationEntitled,
    }).catch(() => []),
    educationEntitled
      ? fetchTechnicianIdentity(
          inspection.technicianId,
          inspection.technicianName,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  const org = inspection.user.organization;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center gap-3">
          {org?.logoUrl && (
            // Plain <img>: token-gated and non-indexed, and next/image would
            // need a remotePatterns entry per customer logo host.
            <img
              src={org.logoUrl}
              alt={org.name ? `${org.name} logo` : "Company logo"}
              className="h-9 w-auto"
            />
          )}
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              About your restoration
            </h1>
            {org?.name && (
              <p className="text-xs text-slate-500 mt-0.5">
                Prepared for you by {org.name}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        {technician && <TechnicianIdentityCard technician={technician} />}

        <PortalContentSections articles={articles} />

        <ClientPortalVideos />

        {/* Not a dead end: someone handed a tablet should be able to get back to
            their own job without knowing the URL. */}
        <div className="pt-2 text-center">
          <Link
            href={`/portal/${token}`}
            className="text-sm text-cyan-700 underline underline-offset-2"
          >
            Back to your job status
          </Link>
        </div>
      </div>

      <footer className="max-w-3xl mx-auto px-5 py-6 text-center border-t border-slate-100 mt-4">
        <p className="text-xs text-slate-400">
          General information about the restoration process. For questions about
          your job or your insurance claim, speak to your technician or your
          insurer.
        </p>
      </footer>
    </main>
  );
}
