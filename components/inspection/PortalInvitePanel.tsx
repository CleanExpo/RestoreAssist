"use client";

import { useState, useEffect, useCallback } from "react";
import { Link2, Send, CheckCircle, Info, Loader2, RefreshCw } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error-message";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { fetchAllClients } from "@/lib/clients/fetch-all-clients";

interface Client {
  id: string;
  name: string;
  email: string;
}

interface PendingInvitation {
  id: string;
  token: string;
  email: string;
  expiresAt: string;
}

interface PortalInvitePanelProps {
  inspectionId: string;
  preselectedClientId?: string | null;
}

function isActivePending(inv: {
  status: string;
  expiresAt: string;
}): boolean {
  return inv.status === "PENDING" && new Date(inv.expiresAt) > new Date();
}

export default function PortalInvitePanel({
  inspectionId: _inspectionId,
  preselectedClientId,
}: PortalInvitePanelProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoadError, setClientsLoadError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState(
    preselectedClientId ?? "",
  );
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [pendingInvitation, setPendingInvitation] =
    useState<PendingInvitation | null>(null);
  const [inviteStatus, setInviteStatus] = useState<
    "idle" | "sent" | "existing_access" | "pending"
  >("idle");

  useEffect(() => {
    // RA-8091 — every page, so an older preselected client is in the list.
    fetchAllClients<Client>()
      .then((all) => {
        setClients(all);
        setClientsLoadError(null);
      })
      .catch((err) => {
        console.error("Error fetching clients:", err);
        setClientsLoadError("Could not load clients. Refresh the page to try again.");
      })
      .finally(() => setLoading(false));
  }, []);

  const loadPendingInvitation = useCallback(async (clientId: string) => {
    if (!clientId) {
      setPendingInvitation(null);
      setInviteStatus((s) => (s === "pending" ? "idle" : s));
      return;
    }
    try {
      const res = await fetch(
        `/api/portal/invitations?clientId=${encodeURIComponent(clientId)}&status=PENDING`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const invitations = (data.invitations ?? []) as Array<
        PendingInvitation & { status: string }
      >;
      const active = invitations.find(isActivePending);
      if (active) {
        setPendingInvitation({
          id: active.id,
          token: active.token,
          email: active.email,
          expiresAt: active.expiresAt,
        });
        setInviteStatus((s) => (s === "sent" ? s : "pending"));
      } else {
        setPendingInvitation(null);
        setInviteStatus((s) => (s === "pending" ? "idle" : s));
      }
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    void loadPendingInvitation(selectedClientId);
  }, [selectedClientId, loadPendingInvitation]);

  useEffect(() => {
    if (preselectedClientId) setSelectedClientId(preselectedClientId);
  }, [preselectedClientId]);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const signupLink =
    pendingInvitation && typeof window !== "undefined"
      ? `${window.location.origin}/portal/signup?token=${pendingInvitation.token}`
      : null;

  const handleResend = async (invitationId: string) => {
    setResending(true);
    try {
      const res = await fetch(
        `/api/portal/invitations/${invitationId}/resend`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notifyError(apiErrorMessage(data) ?? "Failed to resend invitation");
        return;
      }
      notifySuccess(`Invitation resent to ${selectedClient?.email ?? "client"}`);
      setInviteStatus("sent");
      await loadPendingInvitation(selectedClientId);
    } catch {
      notifyError("Failed to resend invitation");
    } finally {
      setResending(false);
    }
  };

  const handleSendInvite = async () => {
    if (!selectedClientId) {
      notifyError("Please select a client");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/portal/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          message: message || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.emailSent === false) {
          notifyError(
            apiErrorMessage(data) ??
              "Invitation saved but email could not be sent — use Resend",
          );
          if (data.invitation?.id) {
            setPendingInvitation({
              id: data.invitation.id,
              token: data.invitation.token,
              email: data.invitation.email,
              expiresAt: data.invitation.expiresAt,
            });
            setInviteStatus("pending");
          }
        } else {
          setInviteStatus("sent");
          notifySuccess(`Portal invite sent to ${selectedClient?.name}`);
        }
      } else if (res.status === 409) {
        await loadPendingInvitation(selectedClientId);
        notifyError(
          "An invitation is already pending — use Resend invitation below",
        );
      } else {
        const errMsg = apiErrorMessage(data) ?? "Failed to send invite";
        const lower = errMsg.toLowerCase();
        if (lower.includes("already has portal access")) {
          setInviteStatus("existing_access");
        } else if (lower.includes("active invitation already exists")) {
          setInviteStatus("pending");
          await loadPendingInvitation(selectedClientId);
        } else {
          notifyError(errMsg);
        }
      }
    } catch {
      notifyError("Failed to send invite");
    } finally {
      setSending(false);
    }
  };

  const copySignupLink = async () => {
    if (!signupLink) return;
    try {
      await navigator.clipboard.writeText(signupLink);
      notifySuccess("Signup link copied to clipboard");
    } catch {
      notifyError("Could not copy link");
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-xl border border-neutral-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Link2 size={16} className="text-cyan-500" />
        <h4 className="font-semibold text-sm">Share Job Status with Client</h4>
      </div>
      <p className="text-xs text-neutral-500 dark:text-slate-400 mb-4">
        Give your client read-only access to track their restoration job
        progress.
      </p>

      {inviteStatus === "sent" && (
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle size={14} /> Invite sent to {selectedClient?.name}
        </div>
      )}
      {inviteStatus === "existing_access" && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <Info size={14} /> This client already has portal access
        </div>
      )}
      {inviteStatus === "pending" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              An invitation is already pending for{" "}
              {selectedClient?.name ?? "this client"}
              {selectedClient?.email ? ` (${selectedClient.email})` : ""}.
              Resend the email or copy the signup link if delivery failed.
            </span>
          </div>
          {pendingInvitation?.id && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleResend(pendingInvitation.id)}
                disabled={resending}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  "bg-cyan-500 hover:bg-cyan-600 text-white disabled:opacity-50",
                )}
              >
                {resending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Resend invitation
              </button>
              {signupLink && pendingInvitation.token && (
                <button
                  type="button"
                  onClick={() => void copySignupLink()}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-neutral-200 dark:border-slate-600 hover:bg-neutral-50 dark:hover:bg-slate-800"
                >
                  <Link2 size={14} />
                  Copy signup link
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {clientsLoadError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {clientsLoadError}
        </p>
      )}

      {inviteStatus === "idle" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">
              Client
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">Select a client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">
              Personal message (optional)
            </label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="We're keeping your home dry..."
              className="w-full rounded-lg border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <button
            onClick={handleSendInvite}
            disabled={sending || !selectedClientId}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              "bg-cyan-500 hover:bg-cyan-600 text-white disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Send Portal Invite
          </button>
        </div>
      )}
    </div>
  );
}
