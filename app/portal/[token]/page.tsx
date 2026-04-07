import { verifyPortalToken } from "@/lib/portal-token";
import { prisma } from "@/lib/prisma";

// Statuses shown in the public timeline (subset of internal statuses)
const PORTAL_STEPS = [
  "DRAFT",
  "SUBMITTED",
  "CLASSIFIED",
  "SCOPED",
  "COMPLETED",
] as const;
type PortalStep = (typeof PORTAL_STEPS)[number];

// Map internal statuses → nearest portal step
function mapToPortalStep(status: string): PortalStep {
  const map: Record<string, PortalStep> = {
    DRAFT: "DRAFT",
    SUBMITTED: "SUBMITTED",
    PROCESSING: "SUBMITTED",
    CLASSIFIED: "CLASSIFIED",
    SCOPED: "SCOPED",
    ESTIMATED: "SCOPED",
    COMPLETED: "COMPLETED",
    REJECTED: "SUBMITTED",
  };
  return map[status] ?? "DRAFT";
}

const STEP_LABELS: Record<PortalStep, string> = {
  DRAFT: "Received",
  SUBMITTED: "Submitted",
  CLASSIFIED: "Classified",
  SCOPED: "Scoped",
  COMPLETED: "Completed",
};

const CATEGORY_COLOURS: Record<string, string> = {
  "1": "bg-green-100 text-green-800",
  "2": "bg-yellow-100 text-yellow-800",
  "3": "bg-orange-100 text-orange-800",
  "4": "bg-red-100 text-red-800",
  A: "bg-blue-100 text-blue-800",
  B: "bg-purple-100 text-purple-800",
  C: "bg-pink-100 text-pink-800",
};

function categoryBadge(category: string | null): string {
  if (!category) return "bg-gray-100 text-gray-600";
  return CATEGORY_COLOURS[category] ?? "bg-gray-100 text-gray-600";
}

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ClientPortalPage({ params }: PageProps) {
  const { token } = await params;

  // Verify token server-side
  const verified = verifyPortalToken(token);

  if (!verified) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Link Expired
          </h1>
          <p className="text-gray-500 text-sm">
            This link has expired. Please contact your technician for a fresh
            link.
          </p>
        </div>
      </main>
    );
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: verified.inspectionId },
    include: {
      moistureReadings: true,
      affectedAreas: true,
      scopeItems: {
        where: { isSelected: true },
      },
      report: {
        select: { status: true, id: true },
      },
    },
  });

  if (!inspection) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Link Expired
          </h1>
          <p className="text-gray-500 text-sm">
            This link has expired. Please contact your technician for a fresh
            link.
          </p>
        </div>
      </main>
    );
  }

  // Moisture summary
  const readings = inspection.moistureReadings;
  const avgMoisture =
    readings.length > 0
      ? Math.round(
          readings.reduce((sum, r) => sum + r.moistureLevel, 0) /
            readings.length,
        )
      : null;
  const isDryingComplete = avgMoisture !== null && avgMoisture < 15;

  const currentStep = mapToPortalStep(inspection.status);
  const currentIndex = PORTAL_STEPS.indexOf(currentStep);
  const reportReady = inspection.report?.status === "COMPLETED";

  const inspectionDate = new Date(inspection.createdAt).toLocaleDateString(
    "en-AU",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
    },
  );

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <span className="text-lg font-bold text-cyan-600 tracking-tight">
              RestoreAssist
            </span>
            <p className="text-xs text-gray-400 mt-0.5">
              Client Job Status Portal
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">
              {inspection.inspectionNumber}
            </p>
            <p className="text-xs text-gray-400">{inspectionDate}</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Address card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
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
              <p className="text-sm font-medium text-gray-900">
                {inspection.propertyAddress}
              </p>
              {inspection.technicianName && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Technician: {inspection.technicianName}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Status timeline */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Job Progress
          </h2>
          <div className="flex items-center gap-0">
            {PORTAL_STEPS.map((step, i) => {
              const isComplete = i < currentIndex;
              const isActive = i === currentIndex;
              const isLast = i === PORTAL_STEPS.length - 1;

              return (
                <div
                  key={step}
                  className="flex items-center flex-1 last:flex-none"
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={[
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                        isComplete
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : isActive
                            ? "bg-cyan-500 border-cyan-500 text-white"
                            : "bg-white border-gray-200 text-gray-300",
                      ].join(" ")}
                    >
                      {isComplete ? (
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span
                      className={[
                        "text-xs mt-1 text-center leading-tight",
                        isActive
                          ? "text-cyan-600 font-semibold"
                          : isComplete
                            ? "text-emerald-600"
                            : "text-gray-300",
                      ].join(" ")}
                    >
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                  {!isLast && (
                    <div
                      className={[
                        "flex-1 h-0.5 mb-5 mx-1",
                        i < currentIndex ? "bg-emerald-400" : "bg-gray-200",
                      ].join(" ")}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Affected areas */}
        {inspection.affectedAreas.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Affected Areas
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({inspection.affectedAreas.length})
              </span>
            </h2>
            <ul className="space-y-2">
              {inspection.affectedAreas.map((area) => (
                <li
                  key={area.id}
                  className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
                >
                  <span className="text-sm text-gray-700">
                    {area.roomZoneId}
                  </span>
                  <div className="flex items-center gap-2">
                    {area.category && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryBadge(area.category)}`}
                      >
                        Cat {area.category}
                      </span>
                    )}
                    {area.class && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                        Class {area.class}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {area.affectedSquareFootage} m²
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Scope summary */}
        {inspection.scopeItems.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Scope of Works
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({inspection.scopeItems.length} items)
              </span>
            </h2>
            <ul className="space-y-1.5">
              {inspection.scopeItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2 text-sm text-gray-700"
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
                  {item.description}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Moisture overview */}
        {readings.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Moisture Overview
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {avgMoisture ?? "—"}
                  <span className="text-sm font-normal text-gray-400">%</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Average current moisture
                </p>
              </div>
              <div
                className={[
                  "px-3 py-1.5 rounded-full text-xs font-semibold",
                  isDryingComplete
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700",
                ].join(" ")}
              >
                {isDryingComplete ? "Drying complete" : "Drying in progress"}
              </div>
            </div>
            {/* Simple bar */}
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={[
                  "h-full rounded-full transition-all",
                  isDryingComplete
                    ? "bg-emerald-400"
                    : avgMoisture !== null && avgMoisture > 40
                      ? "bg-red-400"
                      : "bg-amber-400",
                ].join(" ")}
                style={{ width: `${Math.min(avgMoisture ?? 0, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Report ready banner */}
        {reportReady && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <svg
              className="w-5 h-5 text-emerald-500 flex-shrink-0"
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
            <p className="text-sm text-emerald-700 font-medium">
              Your restoration report is ready.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="max-w-2xl mx-auto px-4 py-6 text-center border-t border-gray-100 mt-4">
        <p className="text-xs text-gray-400">
          Powered by{" "}
          <span className="font-semibold text-cyan-600">RestoreAssist</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          For queries about your job, please contact your technician directly.
        </p>
      </footer>
    </main>
  );
}
