import { notFound } from "next/navigation";
import { resolvePortalInspectionId } from "@/lib/portal/resolve-portal-inspection";
import { prisma } from "@/lib/prisma";
import { ClientPortalVideos } from "@/components/portal/ClientPortalVideos";
import { ClientPortalUpload } from "@/components/portal/ClientPortalUpload";
import { ClientPortalAuthorities } from "@/components/portal/ClientPortalAuthorities";
import { ClientPortalStatus } from "@/components/portal/ClientPortalStatus";
import {
  PortalAboutSection,
  PortalContentSections,
} from "@/components/portal/PortalContentHub";
import { fetchPublishedPortalContent } from "@/lib/portal/fetch-portal-content";
import { requireAddonForWorkspace } from "@/lib/entitlements";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { CLIENT_EDUCATION_SKU } from "@/lib/billing/client-education-addon";
import { fetchTechnicianIdentity } from "@/lib/portal/fetch-technician-identity";
import { TechnicianIdentityCard } from "@/components/portal/TechnicianIdentityCard";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ClientPortalPage({ params }: PageProps) {
  const { token } = await params;

  // Token -> inspection. The lookup order (ClientPortalAccount first, legacy
  // HMAC tokens second) lives in resolvePortalInspectionId so the /learn kiosk
  // resolves identically — see that file for why it is shared rather than
  // copied. If neither path resolves, the framework 404 renders; the friendly
  // "Link Expired" card below still covers the legacy hit-but-deleted case.
  const inspectionId = await resolvePortalInspectionId(token);

  if (!inspectionId) {
    notFound();
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      affectedAreas: {
        select: {
          id: true,
          roomZoneId: true,
        },
      },
      scopeItems: {
        where: { isSelected: true },
        select: {
          id: true,
        },
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
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">
            Link Expired
          </h1>
          <p className="text-slate-500 text-sm">
            This link has expired. Please contact your technician for a fresh
            link.
          </p>
        </div>
      </main>
    );
  }

  const reportReady = inspection.report?.status === "COMPLETED";

  // CLIENT_EDUCATION add-on gate.
  //
  // This page has NO session user — the homeowner opens it from a token link —
  // so the user-keyed requireAddon() cannot be used, and reaching for the
  // technician's id would be wrong anyway: the add-on belongs to the firm that
  // owns the job, not to whoever is assigned to it. Resolve the entitlement the
  // way the job itself is owned: token -> Inspection -> owner -> workspace.
  //
  // FAILS CLOSED. Any error here (no workspace, database blip) yields the FREE
  // article set, never the paid one. The opposite direction would leak the
  // add-on's content on a transient fault and nothing would look wrong on the
  // page — it would simply be fuller than the firm had paid for.
  //
  // An unentitled client sees the free explainers and no upsell: they are not
  // the buyer, and a 402 about their restorer's billing is not their problem.
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

  const portalArticles = await fetchPublishedPortalContent("customer", {
    includeAddonContent: educationEntitled,
  }).catch(() => []);

  // The identity card rides on the same add-on as the library. Nothing is taken
  // away by gating it: the technician's NAME has always been shown above and
  // still is, entitled or not, so a client is never left wondering who is at
  // their door. The add-on adds the photo, biography and checkable credentials.
  const technician = educationEntitled
    ? await fetchTechnicianIdentity(
        inspection.technicianId,
        inspection.technicianName,
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
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <span className="text-lg font-bold text-cyan-600 tracking-tight">
              RestoreAssist
            </span>
            <p className="text-xs text-slate-400 mt-0.5">
              Client Job Status Portal
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">
              {inspection.inspectionNumber}
            </p>
            <p className="text-xs text-slate-400">{inspectionDate}</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Address card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-cyan-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-cyan-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">
                {inspection.propertyAddress}
              </p>
              {inspection.technicianName && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Technician: {inspection.technicianName}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Live claim status — polls the client-safe updates feed */}
        <ClientPortalStatus token={token} />

        {/* Approvals the client still needs to sign (hides itself when none) */}
        <ClientPortalAuthorities token={token} />

        {/* Affected areas */}
        {inspection.affectedAreas.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              Affected Areas
              <span className="ml-2 text-xs font-normal text-slate-400">
                ({inspection.affectedAreas.length})
              </span>
            </h2>
            <ul className="space-y-2">
              {inspection.affectedAreas.map((area) => (
                <li
                  key={area.id}
                  className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0"
                >
                  <span className="text-sm text-slate-700">
                    {area.roomZoneId}
                  </span>
                  <span className="text-xs text-slate-500">
                    Included in the restoration plan
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Scope summary */}
        {inspection.scopeItems.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              Scope of Works
              <span className="ml-2 text-xs font-normal text-slate-400">
                ({inspection.scopeItems.length} items)
              </span>
            </h2>
            <ul className="space-y-1.5">
              {inspection.scopeItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <svg
                    className="w-3.5 h-3.5 text-cyan-500 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Restoration work item included
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Report ready banner */}
        {reportReady && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <svg
              className="w-5 h-5 text-success flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-success font-medium">
              Your restoration report is ready.
            </p>
          </div>
        )}

        {/* Client evidence upload — photos + a note (quarantined for staff review) */}
        <ClientPortalUpload token={token} />

        {/* Who is in your home. Falls back to the bare name above when the
            technician is not linked to a profile, or has opted out of being
            shown publicly. */}
        {technician && <TechnicianIdentityCard technician={technician} />}

        <PortalAboutSection
          logoUrl={org?.logoUrl}
          aboutCopy={org?.aboutCopy}
          orgName={org?.name}
        />

        <PortalContentSections articles={portalArticles} />

        {/* Understanding your claim — explainer videos */}
        <ClientPortalVideos />
      </div>

      {/* Footer */}
      <footer className="max-w-2xl mx-auto px-4 py-6 text-center border-t border-slate-100 mt-4">
        <p className="text-xs text-slate-400">
          Powered by{" "}
          <span className="font-semibold text-cyan-600">RestoreAssist</span>
        </p>
        <p className="text-xs text-slate-400 mt-1">
          For queries about your job, please contact your technician directly.
        </p>
      </footer>
    </main>
  );
}
