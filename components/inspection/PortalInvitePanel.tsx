"use client";

import { useState, useEffect } from "react";
import { Link2, Send, CheckCircle, Info, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  email: string;
}

interface PortalInvitePanelProps {
  inspectionId: string;
  preselectedClientId?: string | null;
}

export default function PortalInvitePanel({
  inspectionId,
  preselectedClientId,
}: PortalInvitePanelProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(
    preselectedClientId ?? "",
  );
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<
    "idle" | "sent" | "existing_access" | "pending"
  >("idle");

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(data.clients ?? []))
      .finally(() => setLoading(false));
  }, []);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const handleSendInvite = async () => {
    if (!selectedClientId) {
      toast.error("Please select a client");
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
      const data = await res.json();
      if (res.ok) {
        setInviteStatus("sent");
        toast.success(`Portal invite sent to ${selectedClient?.name}`);
      } else if (data.error?.includes("already has portal access")) {
        setInviteStatus("existing_access");
      } else if (data.error?.includes("Active invitation already exists")) {
        setInviteStatus("pending");
      } else {
        toast.error(data.error || "Failed to send invite");
      }
    } catch {
      toast.error("Failed to send invite");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 rounded-xl border border-neutral-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50">
      <div className="flex items-center gap-2 mb-3">
        <Link2 size={16} className="text-cyan-500" />
        <h4 className="font-semibold text-sm">Share Job Status with Client</h4>
      </div>
      <p className="text-xs text-neutral-500 dark:text-slate-400 mb-4">
        Give your client read-only access to track their restoration job
        progress.
      </p>

      {inviteStatus === "sent" && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle size={14} /> Invite sent to {selectedClient?.name}
        </div>
      )}
      {inviteStatus === "existing_access" && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <Info size={14} /> This client already has portal access
        </div>
      )}
      {inviteStatus === "pending" && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <Info size={14} /> An invitation is already pending for this client
        </div>
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
