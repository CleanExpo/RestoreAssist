"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Award,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ────────────────────────────────────────────────────────────────────

type CertificationType =
  | "IICRC_WRT"
  | "IICRC_AMRT"
  | "IICRC_FSRT"
  | "IICRC_CCT"
  | "TRADE_PLUMBING"
  | "TRADE_ELECTRICAL"
  | "TRADE_BUILDING"
  | "TRADE_CARPENTRY"
  | "INSURANCE_PUBLIC_LIABILITY"
  | "INSURANCE_PROFESSIONAL_INDEMNITY"
  | "INSURANCE_WORKERS_COMP"
  | "BUSINESS_ABN_REGISTRATION"
  | "BUSINESS_GST_REGISTRATION"
  | "OTHER";

type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";

interface Certification {
  id: string;
  certificationType: CertificationType;
  certificationName: string;
  issuingBody: string;
  certificationNumber: string | null;
  issueDate: string;
  expiryDate: string | null;
  verificationStatus: VerificationStatus;
  documentUrl: string | null;
}

interface CertFormState {
  certificationType: CertificationType | "";
  certificationName: string;
  issuingBody: string;
  certificationNumber: string;
  issueDate: string;
  expiryDate: string;
  documentUrl: string;
}

// ── Label maps ───────────────────────────────────────────────────────────────

const CERT_TYPE_LABELS: Record<CertificationType, string> = {
  IICRC_WRT: "IICRC — Water Restoration Technician",
  IICRC_AMRT: "IICRC — Applied Microbial Remediation",
  IICRC_FSRT: "IICRC — Fire & Smoke Restoration",
  IICRC_CCT: "IICRC — Commercial Carpet Cleaning",
  TRADE_PLUMBING: "Trade — Plumbing",
  TRADE_ELECTRICAL: "Trade — Electrical",
  TRADE_BUILDING: "Trade — Building",
  TRADE_CARPENTRY: "Trade — Carpentry",
  INSURANCE_PUBLIC_LIABILITY: "Insurance — Public Liability",
  INSURANCE_PROFESSIONAL_INDEMNITY: "Insurance — Professional Indemnity",
  INSURANCE_WORKERS_COMP: "Insurance — Workers Compensation",
  BUSINESS_ABN_REGISTRATION: "Business — ABN Registration",
  BUSINESS_GST_REGISTRATION: "Business — GST Registration",
  OTHER: "Other",
};

const CERT_TYPE_VALUES: CertificationType[] = [
  "IICRC_WRT",
  "IICRC_AMRT",
  "IICRC_FSRT",
  "IICRC_CCT",
  "TRADE_PLUMBING",
  "TRADE_ELECTRICAL",
  "TRADE_BUILDING",
  "TRADE_CARPENTRY",
  "INSURANCE_PUBLIC_LIABILITY",
  "INSURANCE_PROFESSIONAL_INDEMNITY",
  "INSURANCE_WORKERS_COMP",
  "BUSINESS_ABN_REGISTRATION",
  "BUSINESS_GST_REGISTRATION",
  "OTHER",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExpiryBadge(expiryDate: string | null): {
  label: string;
  className: string;
} {
  if (!expiryDate) {
    return {
      label: "No Expiry",
      className: "bg-slate-500/10 text-slate-400 border border-slate-500/30",
    };
  }
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: "Expired",
      className: "bg-red-500/10 text-red-400 border border-red-500/30",
    };
  }
  if (diffDays <= 90) {
    return {
      label: "Expiring Soon",
      className: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
    };
  }
  return {
    label: "Valid",
    className: "bg-green-500/10 text-green-400 border border-green-500/30",
  };
}

function getVerificationBadge(status: VerificationStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "VERIFIED":
      return {
        label: "Verified",
        className: "bg-green-500/10 text-green-400 border border-green-500/30",
      };
    case "REJECTED":
      return {
        label: "Rejected",
        className: "bg-red-500/10 text-red-400 border border-red-500/30",
      };
    default:
      return {
        label: "Pending",
        className: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
      };
  }
}

function toDateInputValue(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toISOString().split("T")[0];
}

function emptyForm(): CertFormState {
  return {
    certificationType: "",
    certificationName: "",
    issuingBody: "",
    certificationNumber: "",
    issueDate: "",
    expiryDate: "",
    documentUrl: "",
  };
}

// ── Page component ────────────────────────────────────────────────────────────

export default function ContractorCertificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CertFormState>(emptyForm());

  // Delete confirm state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // ── Auth redirect ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchCertifications();
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchCertifications = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contractors/certifications");
      if (res.status === 404) {
        setProfileMissing(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setCertifications(data.certifications ?? []);
    } catch {
      setMessage({ type: "error", text: "Failed to load certifications" });
    } finally {
      setLoading(false);
    }
  };

  // ── Dialog helpers ─────────────────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEditDialog = (cert: Certification) => {
    setEditingId(cert.id);
    setForm({
      certificationType: cert.certificationType,
      certificationName: cert.certificationName,
      issuingBody: cert.issuingBody,
      certificationNumber: cert.certificationNumber ?? "",
      issueDate: toDateInputValue(cert.issueDate),
      expiryDate: toDateInputValue(cert.expiryDate),
      documentUrl: cert.documentUrl ?? "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  // ── Submit (add / edit) ────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (
      !form.certificationType ||
      !form.certificationName ||
      !form.issuingBody ||
      !form.issueDate
    ) {
      setMessage({
        type: "error",
        text: "Please fill in all required fields (Type, Name, Issuing Body, Issue Date)",
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const payload = {
        certificationType: form.certificationType,
        certificationName: form.certificationName,
        issuingBody: form.issuingBody,
        certificationNumber: form.certificationNumber || null,
        issueDate: form.issueDate,
        expiryDate: form.expiryDate || null,
        documentUrl: form.documentUrl || null,
      };

      const url = editingId
        ? `/api/contractors/certifications/${editingId}`
        : "/api/contractors/certifications";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessage({
          type: "error",
          text: data.error ?? "Failed to save certification",
        });
        return;
      }

      setMessage({
        type: "success",
        text: editingId ? "Certification updated" : "Certification added",
      });
      closeDialog();
      await fetchCertifications();
    } catch {
      setMessage({ type: "error", text: "Failed to save certification" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;

    try {
      const res = await fetch(
        `/api/contractors/certifications/${deleteTargetId}`,
        {
          method: "DELETE",
        },
      );

      if (!res.ok) {
        setMessage({ type: "error", text: "Failed to delete certification" });
        return;
      }

      setCertifications((prev) => prev.filter((c) => c.id !== deleteTargetId));
      setMessage({ type: "success", text: "Certification deleted" });
    } catch {
      setMessage({ type: "error", text: "Failed to delete certification" });
    } finally {
      setDeleteTargetId(null);
    }
  };

  // ── Render states ──────────────────────────────────────────────────────────

  if (status === "loading" || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-9 w-64 mb-8" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (profileMissing) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertCircle className="h-12 w-12 text-amber-400 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Contractor Profile Not Found
          </h2>
          <p className="text-slate-400 mb-6">
            Complete your contractor profile first to manage certifications.
          </p>
          <button
            onClick={() => router.push("/dashboard/contractors/profile")}
            className="px-6 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            Go to Profile
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Certifications</h1>
        <button
          onClick={openAddDialog}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Add Certification
        </button>
      </div>

      {/* Feedback message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === "success"
              ? "bg-green-500/10 border border-green-500/30 text-green-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Empty state */}
      {certifications.length === 0 ? (
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-12 flex flex-col items-center text-center">
          <Award className="h-12 w-12 text-slate-500 mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">
            No certifications yet
          </h2>
          <p className="text-slate-400 mb-6">
            Add your IICRC, trade licences, and insurance certificates to verify
            your profile.
          </p>
          <button
            onClick={openAddDialog}
            className="flex items-center gap-2 px-5 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Add Certification
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {certifications.map((cert) => {
            const expiryBadge = getExpiryBadge(cert.expiryDate);
            const verBadge = getVerificationBadge(cert.verificationStatus);
            return (
              <div
                key={cert.id}
                className="bg-slate-800/30 border border-slate-700 rounded-lg p-5 flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <Award className="h-6 w-6 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">
                      {cert.certificationName}
                    </div>
                    <div className="text-sm text-slate-400 mt-0.5">
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-700/50 border border-slate-600 text-slate-300 mr-2">
                        {CERT_TYPE_LABELS[cert.certificationType] ??
                          cert.certificationType}
                      </span>
                      {cert.issuingBody}
                    </div>
                    {cert.certificationNumber && (
                      <div className="text-xs text-slate-500 mt-1">
                        #{cert.certificationNumber}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-400">
                      <span>
                        Issued:{" "}
                        {new Date(cert.issueDate).toLocaleDateString("en-AU")}
                      </span>
                      {cert.expiryDate && (
                        <span>
                          Expires:{" "}
                          {new Date(cert.expiryDate).toLocaleDateString(
                            "en-AU",
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${expiryBadge.className}`}
                      >
                        {expiryBadge.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${verBadge.className}`}
                      >
                        {verBadge.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {cert.verificationStatus !== "VERIFIED" && (
                    <>
                      <button
                        onClick={() => openEditDialog(cert)}
                        title="Edit"
                        className="p-2 text-slate-400 hover:text-cyan-400 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTargetId(cert.id)}
                        title="Delete"
                        className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingId ? "Edit Certification" : "Add Certification"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Certification Type <span className="text-red-400">*</span>
              </label>
              <Select
                value={form.certificationType}
                onValueChange={(val) =>
                  setForm((f) => ({
                    ...f,
                    certificationType: val as CertificationType,
                  }))
                }
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white focus:ring-cyan-500">
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {CERT_TYPE_VALUES.map((v) => (
                    <SelectItem
                      key={v}
                      value={v}
                      className="text-white hover:bg-slate-700 focus:bg-slate-700"
                    >
                      {CERT_TYPE_LABELS[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Certification Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.certificationName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, certificationName: e.target.value }))
                }
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="e.g. Water Restoration Technician"
              />
            </div>

            {/* Issuing Body */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Issuing Body <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.issuingBody}
                onChange={(e) =>
                  setForm((f) => ({ ...f, issuingBody: e.target.value }))
                }
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="e.g. IICRC"
              />
            </div>

            {/* Certificate Number */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Certification Number
              </label>
              <input
                type="text"
                value={form.certificationNumber}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    certificationNumber: e.target.value,
                  }))
                }
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Optional"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Issue Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, issueDate: e.target.value }))
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expiryDate: e.target.value }))
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Document URL */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Document URL
              </label>
              <input
                type="url"
                value={form.documentUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, documentUrl: e.target.value }))
                }
                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="https://…"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              onClick={closeDialog}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50"
            >
              {submitting
                ? "Saving…"
                : editingId
                  ? "Save Changes"
                  : "Add Certification"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete this certification?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This action cannot be undone. The certification record will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
