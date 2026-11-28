"use client";

import { useState } from "react";
import {
  CheckCircle,
  Clock,
  Loader2,
  Ban,
  Mail,
  Pencil,
  Plus,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  isSigningLinkLive,
  signingLinkExpiresAt,
} from "@/lib/authority-forms/signing-link";

interface Signatory {
  id: string;
  signatoryName: string;
  signatoryRole: string;
  signatoryEmail: string | null;
  signedAt: Date | null;
  signatureRequestSent: boolean;
  signatureRequestSentAt: Date | null;
  signatureData: string | null;
}

interface SignatoryManagerProps {
  formId: string;
  signatories: Signatory[];
  formStatus: string;
  onUpdate: () => void;
}

const ROLES = [
  { value: "CLIENT", label: "Client" },
  { value: "INSURER", label: "Insurer" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "PROPERTY_OWNER", label: "Property Owner" },
  { value: "MANAGER", label: "Manager" },
  { value: "TECHNICIAN", label: "Technician" },
];

export function SignatoryManager({
  formId,
  signatories,
  formStatus,
  onUpdate,
}: SignatoryManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("CLIENT");
  const [adding, setAdding] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const signedCount = signatories.filter((s) => s.signedAt).length;
  const totalCount = signatories.length;
  const isCompleted = formStatus === "COMPLETED";

  const handleAddSignatory = async () => {
    if (!newName.trim() || !newRole) return;

    setAdding(true);
    try {
      const response = await fetch(
        `/api/authority-forms/${formId}/signatures`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_signatory",
            signatoryName: newName.trim(),
            signatoryEmail: newEmail.trim() || undefined,
            signatoryRole: newRole,
          }),
        },
      );

      if (response.ok) {
        toast.success(`Added ${newName.trim()} as signatory`);
        setNewName("");
        setNewEmail("");
        setNewRole("CLIENT");
        setShowAddForm(false);
        onUpdate();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Failed to add signatory");
      }
    } catch {
      toast.error("Failed to add signatory");
    } finally {
      setAdding(false);
    }
  };

  const handleSendRequest = async (signatureId: string) => {
    setSendingId(signatureId);
    try {
      const response = await fetch(
        `/api/authority-forms/${formId}/send-signature-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signatureId }),
        },
      );

      if (response.ok) {
        toast.success("Signature request email sent");
        onUpdate();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Failed to send request");
      }
    } catch {
      toast.error("Failed to send request");
    } finally {
      setSendingId(null);
    }
  };

  // RA-8589: switch an emailed link off, or correct the address. Both clear
  // the old link; staff then press Send Request to mail a fresh one.
  const patchSignatory = async (
    signatureId: string,
    body: { action: "cancel_request" } | { signatoryEmail: string },
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `/api/authority-forms/${formId}/signatures/${signatureId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.ok) return true;
      const data = await response.json().catch(() => ({}));
      toast.error(data.error?.message || "Could not update the signatory");
    } catch {
      toast.error("Could not update the signatory");
    }
    return false;
  };

  const handleCancelRequest = async (signatureId: string) => {
    setCancellingId(signatureId);
    if (await patchSignatory(signatureId, { action: "cancel_request" })) {
      toast.success("Signing link cancelled. The emailed link no longer works.");
      onUpdate();
    }
    setCancellingId(null);
  };

  const handleSaveEmail = async (signatureId: string) => {
    if (!editEmail.trim()) return;
    setSavingEmail(true);
    if (await patchSignatory(signatureId, { signatoryEmail: editEmail.trim() })) {
      toast.success("Email updated. Any link already sent no longer works.");
      setEditingId(null);
      setEditEmail("");
      onUpdate();
    }
    setSavingEmail(false);
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">
            Signatures: {signedCount} of {totalCount}
          </span>
          <span className="text-muted-foreground">
            {isCompleted
              ? "All signed"
              : `${totalCount - signedCount} remaining`}
          </span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isCompleted ? "bg-emerald-500" : "bg-brand-harbour-500"
            }`}
            style={{
              width: `${totalCount > 0 ? (signedCount / totalCount) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Signatory list */}
      <div className="space-y-2">
        {signatories.map((sig) => (
          <div
            key={sig.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              sig.signedAt
                ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            }`}
          >
            {/* Status icon */}
            {sig.signedAt ? (
              <CheckCircle className="h-5 w-5 text-success shrink-0" />
            ) : sig.signatureRequestSent ? (
              <Mail className="h-5 w-5 text-blue-500 shrink-0" />
            ) : (
              <Clock className="h-5 w-5 text-slate-400 shrink-0" />
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">
                  {sig.signatoryName}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                  {sig.signatoryRole}
                </span>
              </div>
              {editingId === sig.id ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    aria-label={`Email address for ${sig.signatoryName}`}
                    className="flex-1 min-w-0 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-md text-xs bg-white dark:bg-slate-900"
                  />
                  <button
                    onClick={() => handleSaveEmail(sig.id)}
                    disabled={savingEmail || !editEmail.trim()}
                    className="px-2 py-1 text-xs font-medium rounded-md bg-brand-harbour-500 hover:bg-brand-harbour-600 text-white disabled:opacity-50"
                  >
                    {savingEmail ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    aria-label="Stop editing email"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                sig.signatoryEmail && (
                  <p className="text-xs text-muted-foreground truncate">
                    {sig.signatoryEmail}
                  </p>
                )
              )}
              {sig.signedAt && (
                <p className="text-xs text-success">
                  Signed {new Date(sig.signedAt).toLocaleDateString("en-AU")}
                </p>
              )}
              {!sig.signedAt &&
                sig.signatureRequestSent &&
                sig.signatureRequestSentAt && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Request sent{" "}
                    {new Date(sig.signatureRequestSentAt).toLocaleDateString(
                      "en-AU",
                    )}
                    {isSigningLinkLive(sig.signatureRequestSentAt)
                      ? ` · link expires ${signingLinkExpiresAt(
                          new Date(sig.signatureRequestSentAt),
                        ).toLocaleDateString("en-AU")}`
                      : " · link expired, resend to renew"}
                  </p>
                )}
            </div>

            {/* RA-8589: correct the address or switch the emailed link off */}
            {!sig.signedAt && !isCompleted && editingId !== sig.id && (
              <button
                onClick={() => {
                  setEditingId(sig.id);
                  setEditEmail(sig.signatoryEmail ?? "");
                }}
                aria-label={`Edit email for ${sig.signatoryName}`}
                title="Edit email"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {!sig.signedAt && sig.signatureRequestSent && !isCompleted && (
              <button
                onClick={() => handleCancelRequest(sig.id)}
                disabled={cancellingId === sig.id}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors shrink-0"
              >
                {cancellingId === sig.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Ban className="h-3.5 w-3.5" />
                )}
                Cancel request
              </button>
            )}

            {/* Action */}
            {!sig.signedAt && sig.signatoryEmail && !isCompleted && (
              <button
                onClick={() => handleSendRequest(sig.id)}
                disabled={sendingId === sig.id}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors shrink-0"
              >
                {sendingId === sig.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {sig.signatureRequestSent ? "Resend" : "Send Request"}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add signatory */}
      {!isCompleted && (
        <>
          {showAddForm ? (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Add Signatory</h4>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full name *"
                  className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-900"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-900"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email address (for sending signature request)"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-white dark:bg-slate-900"
              />
              <button
                onClick={handleAddSignatory}
                disabled={adding || !newName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-brand-harbour-500 hover:bg-brand-harbour-600 text-white disabled:opacity-50 transition-colors"
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Add Signatory
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 w-full px-4 py-2.5 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-slate-400 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Signatory
            </button>
          )}
        </>
      )}
    </div>
  );
}
