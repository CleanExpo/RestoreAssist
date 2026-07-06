"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Building,
  User,
  Calendar,
  DollarSign,
  FileText,
  AlertTriangle,
  Eye,
  ClipboardList,
  Receipt,
} from "lucide-react";
import toast from "react-hot-toast";
import PortalInvitationSection from "@/components/dashboard/PortalInvitationSection";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { formatDate } from "@/lib/formatters";
import { sqftToSqm } from "@/lib/units";

const REPORT_STATUS_TONES: Record<string, StatusTone> = {
  completed: "success",
  approved: "success",
  in_progress: "info",
  pending: "warning",
  draft: "neutral",
};

const CLIENT_STATUS_TONES: Record<string, StatusTone> = {
  ACTIVE: "success",
  INACTIVE: "warning",
  PROSPECT: "info",
  ARCHIVED: "neutral",
};

interface LinkedInspection {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  status: string;
  createdAt: string;
  submittedAt: string | null;
}

interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  company?: string;
  contactPerson?: string;
  notes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  totalRevenue: number;
  lastJob: string;
  reportsCount: number;
  reports: Array<{
    id: string;
    title: string;
    status: string;
    totalCost: number;
    createdAt: string;
    reportNumber?: string;
    waterCategory?: string;
    waterClass?: string;
    affectedArea?: number;
  }>;
}

interface RestorationDoc {
  id: string;
  documentType: string;
  documentNumber: string;
  title: string | null;
  reportId: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [inspections, setInspections] = useState<LinkedInspection[]>([]);
  const [loadingInspections, setLoadingInspections] = useState(false);
  const [inspectionsError, setInspectionsError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<RestorationDoc[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  // Bug 3 (race guard): every fetch in the id effect runs against an
  // AbortController scoped to that id. When the id changes (fast A->B nav) or
  // the component unmounts, the controller is aborted so a slower batch for
  // client A can never resolve and overwrite client B's state. `isAborted()`
  // re-checks the signal before any setState in case a fetch already resolved.
  const fetchInspections = useCallback(
    async (clientId: string, signal: AbortSignal, isAborted: () => boolean) => {
      setLoadingInspections(true);
      setInspectionsError(null);
      try {
        const res = await fetch(
          `/api/inspections?clientId=${clientId}&limit=50`,
          { signal },
        );
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
        const data = await res.json();
        if (isAborted()) return;
        setInspections(data.inspections ?? data ?? []);
      } catch (error) {
        if (signal.aborted || (error as Error)?.name === "AbortError") return;
        console.error("Error fetching inspections:", error);
        if (isAborted()) return;
        setInspectionsError("Couldn't load inspections.");
      } finally {
        if (!isAborted()) setLoadingInspections(false);
      }
    },
    [],
  );

  const fetchInvoices = useCallback(
    async (
      clientData: Client,
      signal: AbortSignal,
      isAborted: () => boolean,
    ) => {
      setInvoicesLoading(true);
      setInvoicesError(null);
      try {
        const res = await fetch(
          `/api/restoration-documents?clientId=${clientData.id}`,
          { signal },
        );
        if (res.ok) {
          const data = await res.json();
          if (isAborted()) return;
          const docs: RestorationDoc[] = data.documents ?? [];
          if (docs.length > 0) {
            setInvoices(docs);
            return;
          }
        } else {
          throw new Error(`Request failed (${res.status})`);
        }
        const reportIds = (clientData.reports ?? [])
          .slice(0, 5)
          .map((r) => r.id);
        if (reportIds.length === 0) {
          if (!isAborted()) setInvoices([]);
          return;
        }
        // Fallback fan-out. A per-report fetch that errors yields [] so one
        // bad report doesn't blank the whole list, but an aborted signal
        // rejects and bubbles to the catch below to be ignored.
        const results = await Promise.all(
          reportIds.map((rid) =>
            fetch(`/api/restoration-documents?reportId=${rid}`, { signal })
              .then((r) => (r.ok ? r.json() : { documents: [] }))
              .then((d) => (d.documents ?? []) as RestorationDoc[])
              .catch((e) => {
                if (signal.aborted || e?.name === "AbortError") throw e;
                return [] as RestorationDoc[];
              }),
          ),
        );
        if (isAborted()) return;
        const seen = new Set<string>();
        const merged: RestorationDoc[] = [];
        for (const batch of results) {
          for (const doc of batch) {
            if (!seen.has(doc.id)) {
              seen.add(doc.id);
              merged.push(doc);
            }
          }
        }
        merged.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setInvoices(merged);
      } catch (error) {
        if (signal.aborted || (error as Error)?.name === "AbortError") return;
        console.error("Error fetching invoices:", error);
        if (isAborted()) return;
        setInvoicesError("Couldn't load invoices.");
      } finally {
        if (!isAborted()) setInvoicesLoading(false);
      }
    },
    [],
  );

  const fetchClient = useCallback(
    async (clientId: string, signal: AbortSignal, isAborted: () => boolean) => {
      try {
        setLoading(true);
        const response = await fetch(`/api/clients/${clientId}`, { signal });
        if (response.ok) {
          const data = await response.json();
          if (isAborted()) return;
          setClient(data);
          void fetchInvoices(data, signal, isAborted);
        } else {
          if (isAborted()) return;
          toast.error("Failed to fetch client details");
        }
      } catch (error) {
        if (signal.aborted || (error as Error)?.name === "AbortError") return;
        console.error("Error fetching client:", error);
        if (isAborted()) return;
        toast.error("Failed to fetch client details");
      } finally {
        if (!isAborted()) setLoading(false);
      }
    },
    [fetchInvoices],
  );

  useEffect(() => {
    const controller = new AbortController();
    const isAborted = () => controller.signal.aborted;
    void fetchClient(id, controller.signal, isAborted);
    void fetchInspections(id, controller.signal, isAborted);
    return () => controller.abort();
  }, [id, fetchClient, fetchInspections]);

  const retryInspections = () => {
    const controller = new AbortController();
    void fetchInspections(
      id,
      controller.signal,
      () => controller.signal.aborted,
    );
  };

  const retryInvoices = () => {
    if (!client) return;
    const controller = new AbortController();
    void fetchInvoices(
      client,
      controller.signal,
      () => controller.signal.aborted,
    );
  };

  const getInspectionStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-amber-500/20 text-amber-400";
      case "SUBMITTED":
        return "bg-blue-500/20 text-blue-400";
      case "PROCESSED":
        return "bg-emerald-500/20 text-emerald-400";
      case "CANCELLED":
        return "bg-red-500/20 text-red-400";
      case "DRAFT":
        return "bg-slate-500/20 text-slate-400";
      default:
        return "bg-slate-500/20 text-slate-400";
    }
  };

  const getDocTypeLabel = (type: string) => {
    if (type === "RESTORATION_INVOICE") return "Tax Invoice";
    return type.replace(/_/g, " ");
  };

  const getDocTypeBadgeColor = (type: string) => {
    if (type === "RESTORATION_INVOICE") return "bg-cyan-500/20 text-cyan-400";
    if (type === "QUOTE" || type === "ESTIMATE")
      return "bg-amber-500/20 text-amber-400";
    return "bg-slate-500/20 text-slate-400";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-12 w-12 text-slate-400 mb-4" />
        <h1 className="text-lg font-medium text-white mb-2">
          Client not found
        </h1>
        <p className="text-slate-400 mb-4">
          The client you're looking for doesn't exist or has been deleted.
        </p>
        <Link
          href="/dashboard/clients"
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Clients
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/clients"
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-semibold mb-2">{client.name}</h1>
            <p className="text-slate-400">Client Details & History</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/clients/${client.id}/edit`}
            className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <Edit size={16} />
            Edit Client
          </Link>
        </div>
      </div>

      {/* Client Info Cards */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Contact Information */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <User className="text-cyan-400" size={20} />
            Contact Information
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="text-slate-400" size={16} />
              <span className="text-slate-300">{client.email}</span>
            </div>
            {client.phone && (
              <div className="flex items-center gap-3">
                <Phone className="text-slate-400" size={16} />
                <span className="text-slate-300">{client.phone}</span>
              </div>
            )}
            {client.address && (
              <div className="flex items-center gap-3">
                <MapPin className="text-slate-400" size={16} />
                <span className="text-slate-300">{client.address}</span>
              </div>
            )}
            {client.company && (
              <div className="flex items-center gap-3">
                <Building className="text-slate-400" size={16} />
                <span className="text-slate-300">{client.company}</span>
              </div>
            )}
          </div>
        </div>

        {/* Business Information */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Building className="text-blue-400" size={20} />
            Business Information
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Status</span>
              <StatusBadge
                tone={CLIENT_STATUS_TONES[client.status] ?? "neutral"}
              >
                {client.status}
              </StatusBadge>
            </div>
            {client.contactPerson && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Contact Person</span>
                <span className="text-slate-300">{client.contactPerson}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Client Since</span>
              <span className="text-slate-300">
                {formatDate(client.createdAt)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Last Updated</span>
              <span className="text-slate-300">
                {formatDate(client.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <DollarSign className="text-success" size={20} />
            Statistics
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total Reports</span>
              <span className="text-2xl font-bold text-cyan-400">
                {client.reportsCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total Revenue</span>
              <span className="text-2xl font-bold text-success">
                ${client.totalRevenue.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Last Job</span>
              <span className="text-slate-300">{client.lastJob}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Avg. Job Value</span>
              <span className="text-slate-300">
                $
                {client.reportsCount > 0
                  ? Math.round(
                      client.totalRevenue / client.reportsCount,
                    ).toLocaleString()
                  : "0"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {client.notes && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <FileText className="text-amber-400" size={20} />
            Notes
          </h2>
          <p className="text-slate-300">{client.notes}</p>
        </div>
      )}

      {/* Portal Invitation Section */}
      <PortalInvitationSection
        clientId={client.id}
        clientEmail={client.email}
        clientName={client.name}
      />

      {/* Inspections */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
          <ClipboardList className="text-cyan-400" size={20} />
          Inspections
          {!loadingInspections && !inspectionsError && (
            <span className="text-slate-400 text-sm font-normal">
              ({inspections.length})
            </span>
          )}
        </h2>
        {loadingInspections ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-14 bg-slate-700/30 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : inspectionsError ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300">
            <span className="text-sm flex items-center gap-2">
              <AlertTriangle size={16} />
              {inspectionsError}
            </span>
            <button
              type="button"
              onClick={retryInspections}
              className="flex-shrink-0 rounded px-3 py-1 text-sm border border-red-500/40 hover:bg-red-500/20 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : inspections.length === 0 ? (
          <div className="text-center py-8">
            <ClipboardList className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <p className="text-slate-400">
              No inspections for this client yet.
            </p>
            <Link
              href="/dashboard/inspections/new"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
            >
              Create First Inspection
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700/50">
                  <th className="pb-3 pr-4 font-medium">#</th>
                  <th className="pb-3 pr-4 font-medium">Address</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Date</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {inspections.map((inspection) => (
                  <tr
                    key={inspection.id}
                    className="hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="py-3 pr-4 font-mono text-slate-300">
                      {inspection.inspectionNumber}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">
                      {inspection.propertyAddress}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getInspectionStatusColor(inspection.status)}`}
                      >
                        {inspection.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-400">
                      {formatDate(
                        inspection.submittedAt ?? inspection.createdAt,
                      )}
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/dashboard/inspections/${inspection.id}`}
                        className="flex items-center gap-1 text-cyan-400 hover:underline"
                      >
                        <Eye size={14} />
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reports History */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
          <FileText className="text-blue-400" size={20} />
          Reports History ({client.reportsCount})
        </h2>
        {client.reports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <p className="text-slate-400">No reports found for this client.</p>
            <Link
              href="/dashboard/reports/new"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
            >
              Create First Report
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {client.reports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg"
              >
                <div className="flex-1">
                  <h3 className="font-medium text-white">{report.title}</h3>
                  <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                    <span>{formatDate(report.createdAt)}</span>
                    {report.reportNumber && <span>#{report.reportNumber}</span>}
                    {report.waterCategory && (
                      <span>{report.waterCategory}</span>
                    )}
                    {report.affectedArea && (
                      <span>
                        {sqftToSqm(report.affectedArea).toFixed(1)} m²
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold text-cyan-400">
                    ${(report.totalCost || 0).toLocaleString()}
                  </span>
                  <StatusBadge
                    tone={
                      REPORT_STATUS_TONES[report.status.toLowerCase()] ??
                      "neutral"
                    }
                  >
                    {report.status.replace("_", " ")}
                  </StatusBadge>
                  <Link
                    href={`/dashboard/reports/${report.id}`}
                    className="flex items-center gap-1 text-cyan-400 hover:underline text-sm"
                  >
                    <Eye size={14} />
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restoration Invoices */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
          <Receipt className="text-success" size={20} />
          Restoration Invoices
          {!invoicesLoading && !invoicesError && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-600/60 text-slate-300">
              {invoices.length}
            </span>
          )}
        </h2>

        {invoicesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-14 bg-slate-700/30 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : invoicesError ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300">
            <span className="text-sm flex items-center gap-2">
              <AlertTriangle size={16} />
              {invoicesError}
            </span>
            <button
              type="button"
              onClick={retryInvoices}
              className="flex-shrink-0 rounded px-3 py-1 text-sm border border-red-500/40 hover:bg-red-500/20 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <p className="text-slate-400">No invoices for this client.</p>
            <Link
              href="/dashboard/restoration-documents/invoice/new"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
            >
              Create Invoice
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getDocTypeBadgeColor(doc.documentType)}`}
                    >
                      {getDocTypeLabel(doc.documentType)}
                    </span>
                    <span className="font-medium text-white">
                      {doc.documentNumber}
                    </span>
                    {doc.title && (
                      <span className="text-slate-400 text-sm truncate max-w-xs">
                        {doc.title}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {new Date(doc.createdAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <Link
                  href={`/dashboard/restoration-documents/invoice/${doc.id}`}
                  className="flex items-center gap-1 text-cyan-400 hover:underline text-sm ml-4"
                >
                  <Eye size={14} />
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
