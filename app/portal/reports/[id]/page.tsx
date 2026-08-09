"use client";

import { useEffect, useRef, useState, use, type RefObject } from "react";
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
  X,
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ApprovalType = "SCOPE_OF_WORK" | "COST_ESTIMATE";
type ApprovalDecision = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

function ApprovalDecisionDialog({
  open,
  approvalType,
  approvalStatus,
  comments,
  submitting,
  returnFocusRef,
  onOpenChange,
  onApprovalStatusChange,
  onCommentsChange,
  onSubmit,
}: {
  open: boolean;
  approvalType: ApprovalType;
  approvalStatus: ApprovalDecision;
  comments: string;
  submitting: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onApprovalStatusChange: (status: ApprovalDecision) => void;
  onCommentsChange: (comments: string) => void;
  onSubmit: () => void;
}) {
  const documentLabel =
    approvalType === "SCOPE_OF_WORK" ? "Scope of Work" : "Cost Estimate";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="max-w-md bg-white text-brand-navy"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        {!submitting && (
          <DialogClose className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-brand-slate transition-colors hover:bg-brand-cloud focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:ring-offset-2">
            <X className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogClose>
        )}
        <DialogHeader>
          <DialogTitle>{documentLabel} Approval</DialogTitle>
          <DialogDescription>
            Review the published document before recording your decision. Your
            response applies to this report revision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="approval-decision"
              className="block text-sm font-medium text-brand-navy mb-2"
            >
              Your Decision
            </label>
            <select
              id="approval-decision"
              value={approvalStatus}
              disabled={submitting}
              onChange={(event) =>
                onApprovalStatusChange(event.target.value as ApprovalDecision)
              }
              className="min-h-11 w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="APPROVED">Approve</option>
              <option value="REJECTED">Reject</option>
              <option value="CHANGES_REQUESTED">Request Changes</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="approval-comments"
              className="block text-sm font-medium text-brand-navy mb-2"
            >
              Comments (Optional)
            </label>
            <textarea
              id="approval-comments"
              value={comments}
              disabled={submitting}
              onChange={(event) => onCommentsChange(event.target.value)}
              rows={4}
              className="min-h-11 w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Add any comments or feedback..."
            />
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="min-h-11 flex-1 px-4 py-2 border border-brand-slate/30 text-brand-navy rounded-lg hover:bg-brand-cloud transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            aria-busy={submitting}
            className="min-h-11 flex-1 px-4 py-2 bg-brand-bronze text-white rounded-lg hover:bg-brand-bronze/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Submitting approval...
              </span>
            ) : (
              "Submit decision"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Report {
  id: string;
  title: string;
  description: string | null;
  status: string;
  reportVersion: number;
  propertyAddress: string;
  hazardType: string;
  totalCost: number | null;
  createdAt: string;
  updatedAt: string;
  waterCategory: string | null;
  waterClass: string | null;
  completionDate: string | null;
  scopeOfWorksDocument: string | null;
  costEstimationDocument: string | null;
  detailedReport: string | null;
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
  const [approvalType, setApprovalType] = useState<ApprovalType | null>(null);
  const [approvalStatus, setApprovalStatus] =
    useState<ApprovalDecision>("APPROVED");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const approvalTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  const handleApprovalClick = (
    type: ApprovalType,
    trigger: HTMLButtonElement,
  ) => {
    approvalTriggerRef.current = trigger;
    setApprovalType(type);
    setShowApprovalModal(true);
  };

  const handleApprovalModalOpenChange = (open: boolean) => {
    setShowApprovalModal(open);
    if (!open) setComments("");
  };

  const handleSubmitApproval = async () => {
    if (!approvalType) return;
    const pendingApproval = getPendingApprovalForType(approvalType);
    if (!pendingApproval || !report) {
      toast.error("This approval request is no longer available");
      return;
    }

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
            approvalId: pendingApproval.id,
            approvalType,
            status: approvalStatus,
            clientComments: comments || null,
            reportVersion: report.reportVersion,
            reportUpdatedAt: report.updatedAt,
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to submit approval");

      toast.success("Approval submitted successfully!");
      handleApprovalModalOpenChange(false);
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
          className="inline-flex items-center gap-2 text-brand-bronze hover:underline mb-6"
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
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
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

              {(report.waterCategory || report.waterClass) && (
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-brand-bronze mt-1" size={20} />
                  <div>
                    <p className="text-sm font-medium text-brand-navy">
                      Water Classification
                    </p>
                    <p className="text-brand-slate">
                      {report.waterCategory}
                      {report.waterClass && ` • Class ${report.waterClass}`}
                    </p>
                  </div>
                </div>
              )}
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
                ) : pendingScopeApproval && report.scopeOfWorksDocument ? (
                  <button
                    onClick={(event) =>
                      handleApprovalClick("SCOPE_OF_WORK", event.currentTarget)
                    }
                    className="px-4 py-2 bg-brand-bronze text-white rounded-lg text-sm font-medium hover:bg-brand-bronze/90 transition-colors"
                  >
                    Review & Respond
                  </button>
                ) : (
                  <span className="text-xs font-medium text-brand-slate">
                    Awaiting contractor request
                  </span>
                )}
              </div>
              <p className="text-sm text-brand-slate">
                Review and approve the proposed scope of work for this
                restoration project.
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
                ) : pendingCostApproval && report.costEstimationDocument ? (
                  <button
                    onClick={(event) =>
                      handleApprovalClick("COST_ESTIMATE", event.currentTarget)
                    }
                    className="px-4 py-2 bg-brand-bronze text-white rounded-lg text-sm font-medium hover:bg-brand-bronze/90 transition-colors"
                  >
                    Review & Respond
                  </button>
                ) : (
                  <span className="text-xs font-medium text-brand-slate">
                    Awaiting contractor request
                  </span>
                )}
              </div>
              <p className="text-sm text-brand-slate">
                Review and approve the cost estimate for the restoration work.
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

      {/* Approval Modal */}
      {approvalType && (
        <ApprovalDecisionDialog
          open={showApprovalModal}
          approvalType={approvalType}
          approvalStatus={approvalStatus}
          comments={comments}
          submitting={submitting}
          returnFocusRef={approvalTriggerRef}
          onOpenChange={handleApprovalModalOpenChange}
          onApprovalStatusChange={setApprovalStatus}
          onCommentsChange={setComments}
          onSubmit={handleSubmitApproval}
        />
      )}
    </div>
  );
}
