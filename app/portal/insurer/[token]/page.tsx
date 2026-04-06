import { verifyInsurerToken } from "@/lib/portal-token";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * /portal/insurer/[token]
 * Tokenised, read-only insurer review surface (RA-429).
 * No login required — HMAC-signed token grants 30-day access to one report.
 */
export default async function InsurerPortalPage({ params }: PageProps) {
  const { token } = await params;

  const verified = verifyInsurerToken(token);
  if (!verified) {
    return <ExpiredPage />;
  }

  const report = await prisma.report.findUnique({
    where: { id: verified.reportId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          businessName: true,
          businessAddress: true,
          businessABN: true,
        },
      },
    },
  });

  if (!report) {
    return <ExpiredPage />;
  }

  // Parse JSON fields
  const moistureReadings = report.moistureReadings
    ? JSON.parse(report.moistureReadings as string)
    : null;
  const scopeAreas = report.scopeAreas
    ? JSON.parse(report.scopeAreas as string)
    : null;
  const equipmentSelection = report.equipmentSelection
    ? JSON.parse(report.equipmentSelection as string)
    : null;

  const eqArr = Array.isArray(equipmentSelection)
    ? equipmentSelection
    : equipmentSelection?.equipment ?? equipmentSelection?.items ?? [];

  const moistureArr = Array.isArray(moistureReadings)
    ? moistureReadings
    : [];

  const areasArr = Array.isArray(scopeAreas) ? scopeAreas : [];

  const inspDate = report.inspectionDate
    ? new Date(report.inspectionDate).toLocaleDateString("en-AU", {
        day: "2-digit", month: "long", year: "numeric",
      })
    : null;

  const pdfUrl = `/api/reports/${report.id}/pdf?token=${token}`;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1C2E47] text-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <span className="text-lg font-bold tracking-tight text-cyan-400">
              RestoreAssist
            </span>
            <p className="text-xs text-slate-400 mt-0.5">
              Insurer Report Review Portal
            </p>
          </div>
          <a
            href={pdfUrl}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF Report
          </a>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Report meta */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                IICRC S500:2025 Compliant Inspection Report
              </p>
              <h1 className="text-xl font-bold text-gray-900">
                {report.reportNumber ?? `Report ${report.id.slice(0, 8).toUpperCase()}`}
              </h1>
              <p className="text-sm text-gray-600 mt-1">{report.propertyAddress}</p>
              {inspDate && (
                <p className="text-xs text-gray-400 mt-0.5">Inspection date: {inspDate}</p>
              )}
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold text-gray-800">
                {report.user?.businessName ?? report.user?.name ?? "—"}
              </p>
              {report.user?.businessABN && (
                <p className="text-xs text-gray-400">ABN {report.user.businessABN}</p>
              )}
              {report.user?.email && (
                <p className="text-xs text-gray-400">{report.user.email}</p>
              )}
            </div>
          </div>
        </div>

        {/* Classification */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Water Damage Classification
            <span className="ml-2 text-xs font-normal text-gray-400">IICRC S500:2025 §3, §7.1</span>
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-0.5">Water Category</p>
              <p className="text-sm font-bold text-gray-800">
                {report.waterCategory ? `Category ${report.waterCategory}` : "—"}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-0.5">Damage Class</p>
              <p className="text-sm font-bold text-gray-800">
                {report.waterClass ? `Class ${report.waterClass}` : "—"}
              </p>
            </div>
            {report.sourceOfWater && (
              <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                <p className="text-xs text-gray-400 mb-0.5">Source of Water</p>
                <p className="text-sm text-gray-800">{report.sourceOfWater}</p>
              </div>
            )}
          </div>
        </div>

        {/* Affected areas */}
        {areasArr.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Affected Areas
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1C2E47] text-white">
                    {["Room / Area", "Material", "Category", "Class", "Area (m²)"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {areasArr.map((area: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-1.5 text-gray-700">{area.roomName ?? area.name ?? "—"}</td>
                      <td className="px-3 py-1.5 text-gray-700">{area.material ?? "—"}</td>
                      <td className="px-3 py-1.5 text-gray-700">{area.category ? `Cat ${area.category}` : "—"}</td>
                      <td className="px-3 py-1.5 text-gray-700">{area.class ?? "—"}</td>
                      <td className="px-3 py-1.5 text-gray-700">{area.area ?? area.affectedSquareFootage ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Moisture readings */}
        {moistureArr.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">
              Moisture Readings
              <span className="ml-2 text-xs font-normal text-gray-400">IICRC S500:2025 §8</span>
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              Drying goal: all affected materials must reach equilibrium MC per S500:2025 §12.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1C2E47] text-white">
                    {["Location", "Material", "Reading (%)", "Status", "Date"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {moistureArr.map((r: any, i: number) => {
                    const val = parseFloat(r.moistureLevel ?? r.value ?? r.reading ?? "");
                    const statusColor = isNaN(val) ? "text-gray-400" : val > 18 ? "text-red-600 font-semibold" : val > 14 ? "text-amber-600 font-semibold" : "text-emerald-600 font-semibold";
                    const statusLabel = isNaN(val) ? "—" : val > 18 ? "Above goal" : val > 14 ? "Monitoring" : "Within goal";
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-3 py-1.5 text-gray-700">{r.location ?? r.room ?? "—"}</td>
                        <td className="px-3 py-1.5 text-gray-700">{r.material ?? "—"}</td>
                        <td className="px-3 py-1.5 text-gray-700">{isNaN(val) ? "—" : `${val}%`}</td>
                        <td className={`px-3 py-1.5 ${statusColor}`}>{statusLabel}</td>
                        <td className="px-3 py-1.5 text-gray-700">
                          {r.date ? new Date(r.date).toLocaleDateString("en-AU") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Equipment log */}
        {eqArr.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Equipment Deployment Log
              <span className="ml-2 text-xs font-normal text-gray-400">IICRC S500:2025 §14</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1C2E47] text-white">
                    {["Equipment Type", "Brand / Model", "Serial No.", "Location"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eqArr.map((eq: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-1.5 text-gray-700">{eq.type ?? eq.name ?? "—"}</td>
                      <td className="px-3 py-1.5 text-gray-700">{`${eq.brand ?? eq.make ?? ""}${eq.model ? ` ${eq.model}` : ""}`.trim() || "—"}</td>
                      <td className="px-3 py-1.5 text-gray-400 font-mono">{eq.serialNumber ?? eq.serial ?? "—"}</td>
                      <td className="px-3 py-1.5 text-gray-700">{eq.location ?? eq.room ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Report narrative */}
        {report.detailedReport && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Inspection Report</h2>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {report.detailedReport}
            </div>
          </div>
        )}

        {/* PDF CTA */}
        <div className="bg-[#1C2E47] rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white">Full PDF Report Available</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Download the complete IICRC S500:2025 compliant report for your records.
            </p>
          </div>
          <a
            href={pdfUrl}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-sm font-semibold text-white transition-colors"
          >
            Download PDF
          </a>
        </div>
      </div>

      <footer className="max-w-3xl mx-auto px-4 py-6 text-center mt-4">
        <p className="text-xs text-gray-400">
          This report has been prepared in accordance with{" "}
          <span className="font-semibold">IICRC S500:2025</span> — Standard and Reference
          Guide for Professional Water Damage Restoration.
        </p>
        <p className="text-xs text-gray-300 mt-1">
          Powered by <span className="font-semibold text-cyan-600">RestoreAssist</span>
        </p>
      </footer>
    </main>
  );
}

function ExpiredPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Link Expired or Invalid</h1>
        <p className="text-gray-500 text-sm">
          This insurer report link has expired or is invalid. Please contact the
          restoration company for an updated link.
        </p>
      </div>
    </main>
  );
}
