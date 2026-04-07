"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Printer,
  MapPin,
  Calendar,
  Droplets,
  Thermometer,
  FileText,
  DollarSign,
  Image,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

interface ScopeItem {
  id?: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  totalCost?: number;
  justification?: string;
  category?: string;
}

interface CostLineItem {
  description: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  totalCost?: number;
}

interface CostEstimationData {
  totalIncGST?: number;
  totalExGST?: number;
  lineItems?: CostLineItem[];
  subtotal?: number;
  gst?: number;
}

interface ScopeOfWorksData {
  items?: ScopeItem[];
  summary?: string;
}

interface PsychrometricAssessment {
  temperature?: number;
  humidity?: number;
  dewPoint?: number;
  readings?: Array<{
    temperature?: number;
    relativeHumidity?: number;
    dewPoint?: number;
    location?: string;
  }>;
}

interface Report {
  id: string;
  title: string;
  reportNumber?: string;
  status: string;
  clientName: string;
  propertyAddress: string;
  waterCategory?: string;
  waterClass?: string;
  hazardType?: string;
  insuranceType?: string;
  inspectionDate?: string;
  createdAt: string;
  updatedAt: string;
  totalCost?: number;
  affectedArea?: number;
  sourceOfWater?: string;
  description?: string;
  detailedReport?: string;
  scopeOfWorksData?: ScopeOfWorksData;
  costEstimationData?: CostEstimationData;
  psychrometricAssessment?: PsychrometricAssessment;
  psychrometricReadings?: Array<{
    temperature?: number;
    relativeHumidity?: number;
    dewPoint?: number;
    location?: string;
  }>;
  user?: { name?: string; email?: string };
  client?: { name?: string; email?: string; phone?: string; company?: string };
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
      <div className="h-5 bg-slate-200 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        <div className="h-4 bg-slate-100 rounded w-full" />
        <div className="h-4 bg-slate-100 rounded w-5/6" />
        <div className="h-4 bg-slate-100 rounded w-4/6" />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-cyan-500">{icon}</span>
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

export default function ReportPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/reports/${id}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setReport(data);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 bg-slate-200 rounded w-48 animate-pulse mb-6" />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Report Not Found
        </h2>
        <p className="text-slate-500 mb-6">
          This report does not exist or you do not have access.
        </p>
        <Link
          href="/dashboard/reports"
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Reports
        </Link>
      </div>
    );
  }

  const scopeItems: ScopeItem[] = report.scopeOfWorksData?.items ?? [];
  const costData = report.costEstimationData;
  const psychro = report.psychrometricAssessment;
  const psychroReadings =
    report.psychrometricReadings ?? psychro?.readings ?? [];

  const formatCurrency = (val?: number | null) =>
    val != null
      ? `$${val.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 print:px-0 print:py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href={`/dashboard/reports/${id}`}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={18} />
          <span>Back to Report</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <Printer size={15} />
            Print
          </button>
          <Link
            href={`/api/reports/${id}/download`}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm"
          >
            <Download size={15} />
            Download PDF
          </Link>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Report Preview</h1>
        {report.reportNumber && (
          <p className="text-slate-500 text-sm">
            Report #{report.reportNumber}
          </p>
        )}
      </div>

      <div className="space-y-6">
        {/* Report title banner */}
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 rounded-xl p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-1">{report.title}</h1>
              {report.reportNumber && (
                <p className="text-cyan-100 text-sm">
                  Report #{report.reportNumber}
                </p>
              )}
            </div>
            <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
              {report.status}
            </span>
          </div>
        </div>

        {/* Property Information */}
        <SectionCard title="Property Information" icon={<MapPin size={18} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Client" value={report.clientName} />
            <Field label="Property Address" value={report.propertyAddress} />
            <Field label="Claim Type / Hazard" value={report.hazardType} />
            <Field
              label="Insurer / Insurance Type"
              value={report.insuranceType}
            />
            <Field
              label="Inspection Date"
              value={
                report.inspectionDate
                  ? new Date(report.inspectionDate).toLocaleDateString(
                      "en-AU",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      },
                    )
                  : undefined
              }
            />
            {report.affectedArea != null && (
              <Field
                label="Affected Area"
                value={`${report.affectedArea} m²`}
              />
            )}
          </div>
        </SectionCard>

        {/* Damage Classification */}
        {(report.waterCategory || report.waterClass) && (
          <SectionCard
            title="Damage Classification"
            icon={<Droplets size={18} />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Water Category" value={report.waterCategory} />
              <Field label="Water Class" value={report.waterClass} />
              <Field label="Source of Water" value={report.sourceOfWater} />
            </div>
            {report.detailedReport && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  IICRC Assessment Notes
                </p>
                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed line-clamp-6">
                  {report.detailedReport}
                </p>
              </div>
            )}
          </SectionCard>
        )}

        {/* Environmental Data */}
        {(psychro || psychroReadings.length > 0) && (
          <SectionCard
            title="Environmental Data"
            icon={<Thermometer size={18} />}
          >
            {psychro &&
              (psychro.temperature != null || psychro.humidity != null) && (
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {psychro.temperature != null && (
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-blue-600 font-medium">
                        Temperature
                      </p>
                      <p className="text-xl font-bold text-blue-800">
                        {psychro.temperature}°C
                      </p>
                    </div>
                  )}
                  {psychro.humidity != null && (
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-green-600 font-medium">
                        Humidity
                      </p>
                      <p className="text-xl font-bold text-green-800">
                        {psychro.humidity}%
                      </p>
                    </div>
                  )}
                  {psychro.dewPoint != null && (
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-purple-600 font-medium">
                        Dew Point
                      </p>
                      <p className="text-xl font-bold text-purple-800">
                        {psychro.dewPoint}°C
                      </p>
                    </div>
                  )}
                </div>
              )}
            {psychroReadings.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-2 text-slate-500 font-medium">
                        Location
                      </th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">
                        Temp (°C)
                      </th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">
                        RH (%)
                      </th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">
                        Dew Pt (°C)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {psychroReadings.map((r, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 px-2 text-slate-700">
                          {r.location ?? `Reading ${i + 1}`}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-700">
                          {r.temperature ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-700">
                          {r.relativeHumidity ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-700">
                          {r.dewPoint ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}

        {/* Scope of Works */}
        {scopeItems.length > 0 && (
          <SectionCard title="Scope of Works" icon={<FileText size={18} />}>
            {report.scopeOfWorksData?.summary && (
              <p className="text-slate-600 text-sm mb-4">
                {report.scopeOfWorksData.summary}
              </p>
            )}
            <div className="space-y-3">
              {scopeItems.map((item, i) => (
                <div
                  key={item.id ?? i}
                  className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  <ChevronRight
                    size={16}
                    className="text-cyan-500 mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 text-sm font-medium">
                      {item.description}
                    </p>
                    {item.justification && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        [{item.justification}]
                      </p>
                    )}
                    {item.category && (
                      <span className="inline-block text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded mt-1">
                        {item.category}
                      </span>
                    )}
                  </div>
                  {item.totalCost != null && (
                    <p className="text-slate-700 text-sm font-medium shrink-0">
                      {formatCurrency(item.totalCost)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Cost Estimate */}
        {costData && (
          <SectionCard title="Cost Estimate" icon={<DollarSign size={18} />}>
            {costData.lineItems && costData.lineItems.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-2 text-slate-500 font-medium">
                        Description
                      </th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">
                        Qty
                      </th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">
                        Unit Cost
                      </th>
                      <th className="text-right py-2 px-2 text-slate-500 font-medium">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.lineItems.map((li, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 px-2 text-slate-700">
                          {li.description}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-600">
                          {li.quantity ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-600">
                          {formatCurrency(li.unitCost)}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-700 font-medium">
                          {formatCurrency(li.totalCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-slate-200 pt-4 space-y-2">
              {costData.subtotal != null && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal (ex GST)</span>
                  <span>{formatCurrency(costData.subtotal)}</span>
                </div>
              )}
              {costData.gst != null && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>GST</span>
                  <span>{formatCurrency(costData.gst)}</span>
                </div>
              )}
              {(costData.totalIncGST ?? report.totalCost) != null && (
                <div className="flex justify-between text-base font-bold text-slate-800 pt-1 border-t border-slate-200">
                  <span>Total (inc GST)</span>
                  <span className="text-cyan-600">
                    {formatCurrency(costData.totalIncGST ?? report.totalCost)}
                  </span>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* Description if present but no structured data */}
        {report.description && !costData && scopeItems.length === 0 && (
          <SectionCard title="Report Notes" icon={<FileText size={18} />}>
            <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
              {report.description}
            </p>
          </SectionCard>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 py-4 print:block hidden">
          Generated by RestoreAssist &bull;{" "}
          {new Date(report.createdAt).toLocaleDateString("en-AU")}
        </div>
      </div>
    </div>
  );
}
