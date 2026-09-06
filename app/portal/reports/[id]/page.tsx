"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  getStoredClientSession,
  portalFetch,
} from "@/lib/portal/client-session";
import PortalNav from "@/components/portal/PortalNav";
import {
  ArrowLeft,
  FileText,
  MapPin,
  Calendar,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Download,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Report {
  id: string;
  title: string;
  description: string | null;
  status: string;
  propertyAddress: string;
  hazardType: string;
  totalCost: number | null;
  createdAt: string;
  updatedAt: string;
  completionDate: string | null;
  scopeOfWorksDocument: string | null;
  costEstimationDocument: string | null;
  client: {
    name: string;
    email: string;
    phone: string | null;
  };
  user: {
    name: string | null;
    businessName: string | null;
    businessPhone: string | null;
    businessEmail: string | null;
  };
  approvals: Array<{
    id: string;
    approvalType: string;
    status: string;
    requestedAt: string;
    respondedAt: string | null;
    clientComments: string | null;
    amount: number | null;
  }>;
}

export default function PortalReportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalType, setApprovalType] = useState<
    "SCOPE_OF_WORK" | "COST_ESTIMATE" | null
  >(null);
  const [approvalStatus, setApprovalStatus] = useState<
    "APPROVED" | "REJECTED" | "CHANGES_REQUESTED"
  >("APPROVED");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (!getStoredClientSession()) {
      router.push("/portal/login");
      return;
    }
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchReport = async () => {
    try {
      const response = await portalFetch(`/api/portal/reports/${id}`);
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/portal/login");
          return;
        }
        if (response.status === 404) {
          toast.error("Report not found");
          router.push("/portal");
          return;
        }
        throw new Error("Failed to fetch report");
      }
      const data = await response.json();
      setReport(data.report);
    } catch (error) {
      console.error("Error fetching report:", error);
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const handleApprovalClick = (type: "SCOPE_OF_WORK" | "COST_ESTIMATE") => {
    setApprovalType(type);
    setShowApprovalModal(true);
  };

  const handleSubmitApproval = async () => {
    if (!approvalType) return;

    setSubmitting(true);

    try {
      const response = await portalFetch(
        `/api/portal/reports/${id}/approvals`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            approvalType,
            status: approvalStatus,
            clientComments: comments || null,
            amount: report?.totalCost || null,
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to submit approval");

      toast.success("Approval submitted successfully!");
      setShowApprovalModal(false);
      setComments("");
      fetchReport(); // Refresh report data
    } catch (error) {
      console.error("Error submitting approval:", error);
      toast.error("Failed to submit approval");
    } finally {
      setSubmitting(false);
    }
  };

  const getApprovalForType = (type: string) => {
    return report?.approvals.find(
      (a) => a.approvalType === type && a.status !== "PENDING",
    );
  };

  const getPendingApprovalForType = (type: string) => {
    return report?.approvals.find(
      (a) => a.approvalType === type && a.status === "PENDING",
    );
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    setDownloadingPdf(true);
    try {
      const res = await portalFetch(
        `/api/portal/reports/${report.id}/download`,
      );
      if (!res.ok) throw new Error("Download failed");

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("json")) {
        const data = await res.json();
        if (data.url) {
          window.open(data.url, "_blank");
          return;
        }
        throw new Error(data.error || "Download failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${report.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
      toast.error("Failed to download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config = {
      APPROVED: {
        bg: "bg-green-100",
        text: "text-success",
        icon: <CheckCircle size={16} />,
      },
      REJECTED: {
        bg: "bg-red-100",
        text: "text-destructive",
        icon: <XCircle size={16} />,
      },
      CHANGES_REQUESTED: {
        bg: "bg-orange-100",
        text: "text-orange-700",
        icon: <AlertCircle size={16} />,
      },
      PENDING: {
        bg: "bg-yellow-100",
        text: "text-yellow-700",
        icon: <Clock size={16} />,
      },
    };
    return config[status as keyof typeof config] || config.PENDING;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cloud">
        <PortalNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-bronze mx-auto mb-4"></div>
            <p className="text-brand-slate">Loading report...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-brand-cloud">
        <PortalNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <p className="text-brand-slate">Report not found</p>
            <Link
              href="/portal"
              className="text-brand-bronze hover:underline mt-4 inline-block"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const scopeApproval = getApprovalForType("SCOPE_OF_WORK");
  const costApproval = getApprovalForType("COST_ESTIMATE");
  const pendingScopeApproval = getPendingApprovalForType("SCOPE_OF_WORK");
  const pendingCostApproval = getPendingApprovalForType("COST_ESTIMATE");

  const contractorName =
    report.user.businessName || report.user.name || "Your Contractor";

  return (
    <div className="min-h-screen bg-brand-cloud">
      <PortalNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/portal"
          className="inline-flex min-h-11 items-center gap-2 text-brand-cta hover:underline mb-6"
        >
          <ArrowLeft size={18} />
          Back to Reports
        </Link>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-3xl font-bold text-brand-navy">
              {report.title}
            </h1>
            <div className="flex items-center gap-3">
              <div
                className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(report.status).bg} ${getStatusBadge(report.status).text}`}
              >
                {report.status}
              </div>
              {report.status !== "DRAFT" && (
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="flex min-h-11 items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {downloadingPdf ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download PDF
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {report.description && (
            <p className="text-brand-slate mb-6">{report.description}</p>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="text-brand-bronze mt-1" size={20} />
                <div>
                  <p className="text-sm font-medium text-brand-navy">
                    Property Address
                  </p>
                  <p className="text-brand-slate">{report.propertyAddress}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <FileText className="text-brand-bronze mt-1" size={20} />
                <div>
                  <p className="text-sm font-medium text-brand-navy">
                    Hazard Type
                  </p>
                  <p className="text-brand-slate">{report.hazardType}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {report.totalCost && (
                <div className="flex items-start gap-3">
                  <DollarSign className="text-brand-bronze mt-1" size={20} />
                  <div>
                    <p className="text-sm font-medium text-brand-navy">
                      Estimated Cost
                    </p>
                    <p className="text-2xl font-bold text-brand-navy">
                      ${report.totalCost.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Calendar className="text-brand-bronze mt-1" size={20} />
                <div>
                  <p className="text-sm font-medium text-brand-navy">
                    Report Created
                  </p>
                  <p className="text-brand-slate">
                    {new Date(report.createdAt).toLocaleDateString("en-AU", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {report.completionDate && (
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-brand-bronze mt-1" size={20} />
                  <div>
                    <p className="text-sm font-medium text-brand-navy">
                      Completion Date
                    </p>
                    <p className="text-brand-slate">
                      {new Date(report.completionDate).toLocaleDateString(
                        "en-AU",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        },
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Approval Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-brand-navy mb-4">
            Approvals Required
          </h2>

          <div className="space-y-4">
            {/* Scope of Work Approval */}
            <div className="border border-brand-slate/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-brand-navy">Scope of Work</h3>
                {scopeApproval ? (
                  <div
                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(scopeApproval.status).bg} ${getStatusBadge(scopeApproval.status).text}`}
                  >
                    {getStatusBadge(scopeApproval.status).icon}
                    {scopeApproval.status.replace("_", " ")}
                  </div>
                ) : pendingScopeApproval ? (
                  <div
                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge("PENDING").bg} ${getStatusBadge("PENDING").text}`}
                  >
                    {getStatusBadge("PENDING").icon}
                    PENDING
                  </div>
                ) : (
                  <button
                    onClick={() => handleApprovalClick("SCOPE_OF_WORK")}
                    className="min-h-11 px-4 py-2 bg-brand-cta text-white rounded-lg text-sm font-medium hover:bg-brand-cta-hover transition-colors"
                  >
                    Review & Approve
                  </button>
                )}
              </div>
              <p className="text-sm text-brand-slate">
                Review and approve the proposed scope of work for this
                restoration project.
              </p>
              <p className="mt-2 text-xs text-brand-slate">
                This client copy excludes reviewer-only classifications and raw readings.
              </p>
              {report.scopeOfWorksDocument ? (
                <details className="mt-3 border border-brand-slate/20 rounded-lg">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-navy bg-brand-cloud rounded-lg">
                    View Scope of Works document
                  </summary>
                  <pre className="p-3 max-h-96 overflow-y-auto whitespace-pre-wrap text-xs text-brand-slate font-sans">
                    {report.scopeOfWorksDocument}
                  </pre>
                </details>
              ) : (
                <p className="mt-3 text-xs text-brand-slate italic">
                  The scope of works document has not been provided yet — ask
                  your contractor before approving.
                </p>
              )}
              {scopeApproval?.clientComments && (
                <div className="mt-3 p-3 bg-brand-cloud rounded">
                  <p className="text-sm font-medium text-brand-navy mb-1">
                    Your Comments:
                  </p>
                  <p className="text-sm text-brand-slate">
                    {scopeApproval.clientComments}
                  </p>
                </div>
              )}
            </div>

            {/* Cost Estimate Approval */}
            <div className="border border-brand-slate/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-brand-navy">Cost Estimate</h3>
                {costApproval ? (
                  <div
                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(costApproval.status).bg} ${getStatusBadge(costApproval.status).text}`}
                  >
                    {getStatusBadge(costApproval.status).icon}
                    {costApproval.status.replace("_", " ")}
                  </div>
                ) : pendingCostApproval ? (
                  <div
                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge("PENDING").bg} ${getStatusBadge("PENDING").text}`}
                  >
                    {getStatusBadge("PENDING").icon}
                    PENDING
                  </div>
                ) : (
                  <button
                    onClick={() => handleApprovalClick("COST_ESTIMATE")}
                    className="min-h-11 px-4 py-2 bg-brand-cta text-white rounded-lg text-sm font-medium hover:bg-brand-cta-hover transition-colors"
                  >
                    Review & Approve
                  </button>
                )}
              </div>
              <p className="text-sm text-brand-slate">
                Review and approve the cost estimate for the restoration work.
              </p>
              <p className="mt-2 text-xs text-brand-slate">
                Ask your contractor for the separate technical evidence report if your insurer needs it.
              </p>
              {report.costEstimationDocument ? (
                <details className="mt-3 border border-brand-slate/20 rounded-lg">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-navy bg-brand-cloud rounded-lg">
                    View Cost Estimate document
                  </summary>
                  <pre className="p-3 max-h-96 overflow-y-auto whitespace-pre-wrap text-xs text-brand-slate font-sans">
                    {report.costEstimationDocument}
                  </pre>
                </details>
              ) : (
                <p className="mt-3 text-xs text-brand-slate italic">
                  The cost estimate document has not been provided yet — ask
                  your contractor before approving.
                </p>
              )}
              {costApproval?.clientComments && (
                <div className="mt-3 p-3 bg-brand-cloud rounded">
                  <p className="text-sm font-medium text-brand-navy mb-1">
                    Your Comments:
                  </p>
                  <p className="text-sm text-brand-slate">
                    {costApproval.clientComments}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contractor Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-brand-navy mb-4">
            Contractor Information
          </h2>
          <div className="space-y-2">
            <p>
              <span className="font-medium">Company:</span> {contractorName}
            </p>
            {report.user.businessEmail && (
              <p>
                <span className="font-medium">Email:</span>{" "}
                {report.user.businessEmail}
              </p>
            )}
            {report.user.businessPhone && (
              <p>
                <span className="font-medium">Phone:</span>{" "}
                {report.user.businessPhone}
              </p>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={showApprovalModal && approvalType !== null}
        onOpenChange={(open) => {
          setShowApprovalModal(open);
          if (!open) setComments("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-brand-navy">
              {approvalType === "SCOPE_OF_WORK"
                ? "Scope of Work"
                : "Cost Estimate"}{" "}
              Approval
            </DialogTitle>
            <DialogDescription>
              Record your decision. You can add a note for the restoration
              team before submitting it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="approval-decision" className="mb-2 text-brand-navy">
                Your Decision
              </Label>
              <select
                id="approval-decision"
                value={approvalStatus}
                onChange={(e) => setApprovalStatus(e.target.value as any)}
                className="min-h-11 w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-cta"
              >
                <option value="APPROVED">Approve</option>
                <option value="REJECTED">Reject</option>
                <option value="CHANGES_REQUESTED">Request Changes</option>
              </select>
            </div>

            <div>
              <Label htmlFor="approval-comments" className="mb-2 text-brand-navy">
                Comments (Optional)
              </Label>
              <textarea
                id="approval-comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
                className="min-h-24 w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-cta"
                placeholder="Add any comments or feedback..."
              />
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <button
              onClick={() => setShowApprovalModal(false)}
              disabled={submitting}
              className="min-h-11 px-4 py-2 border border-brand-slate/30 text-brand-navy rounded-lg hover:bg-brand-cloud transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitApproval}
              disabled={submitting}
              className="min-h-11 px-4 py-2 bg-brand-cta text-white rounded-lg hover:bg-brand-cta-hover transition-colors disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
