"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { PortalEmptyProject } from "@/components/portal/PortalEmptyProject";
import { ClientPortalAccountLayout } from "@/components/portal/ClientPortalAccountLayout";
import {
  getStoredClientSession,
  portalFetch,
} from "@/lib/portal/client-session";
import {
  clientPortalEyebrow,
  clientPortalPanelPadding,
} from "@/lib/portal/client-portal-theme";

interface Report {
  id: string;
  title: string;
  description: string | null;
  status: string;
  propertyAddress: string;
  hazardType: string;
  createdAt: string;
  updatedAt: string;
  completionDate: string | null;
  pendingApprovals: number;
  approvedCount: number;
  rejectedCount: number;
}

export default function PortalDashboard() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getStoredClientSession()) {
      router.push("/portal/login");
      return;
    }
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchReports = async () => {
    try {
      const response = await portalFetch("/api/portal/reports");
      if (response.status === 401) {
        router.push("/portal/login");
        return;
      }
      if (!response.ok) throw new Error("Failed to fetch reports");
      const data = await response.json();
      setReports(data.reports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: "bg-slate-800 text-slate-300 border-white/10",
      PENDING: "bg-amber-500/15 text-amber-200 border-amber-500/30",
      APPROVED: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
      COMPLETED: "bg-cyan-500/15 text-cyan-200 border-cyan-500/30",
      ARCHIVED: "bg-slate-800 text-slate-500 border-white/10",
    };
    return styles[status] ?? styles.DRAFT;
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "APPROVED":
      case "COMPLETED":
        return <CheckCircle size={16} />;
      case "PENDING":
        return <Clock size={16} />;
      case "ARCHIVED":
        return <XCircle size={16} />;
      default:
        return <FileText size={16} />;
    }
  };

  if (loading) {
    return (
      <ClientPortalAccountLayout>
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
          <p className="text-slate-400">Loading your reports…</p>
        </div>
      </ClientPortalAccountLayout>
    );
  }

  return (
    <ClientPortalAccountLayout>
      <div className="mb-8">
        <p className={clientPortalEyebrow}>Your account</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
          My restoration reports
        </h1>
        <p className="mt-2 text-slate-400">
          Track progress and respond to approvals your restorer sent you.
        </p>
      </div>

      {reports.length === 0 ? (
        <PortalEmptyProject />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/portal/reports/${report.id}`}
              className={`${clientPortalPanelPadding} block transition hover:border-cyan-400/30 hover:shadow-cyan-950/20`}
            >
              <div className="mb-4 flex items-start justify-between">
                <div
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(report.status)}`}
                >
                  {statusIcon(report.status)}
                  {report.status}
                </div>
                {report.pendingApprovals > 0 && (
                  <div className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-1 text-xs font-medium text-orange-200">
                    <AlertCircle size={14} />
                    {report.pendingApprovals}
                  </div>
                )}
              </div>

              <h3 className="mb-2 line-clamp-2 text-lg font-semibold text-white">
                {report.title}
              </h3>

              <div className="space-y-2 text-sm text-slate-400">
                <p className="flex items-start gap-2">
                  <span className="font-medium text-slate-500">Address:</span>
                  <span className="line-clamp-2">{report.propertyAddress}</span>
                </p>
                <p>
                  <span className="font-medium text-slate-500">Type:</span>{" "}
                  {report.hazardType}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-500">
                <span>
                  Created {new Date(report.createdAt).toLocaleDateString()}
                </span>
                {report.completionDate && (
                  <span>
                    Completed{" "}
                    {new Date(report.completionDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </ClientPortalAccountLayout>
  );
}
