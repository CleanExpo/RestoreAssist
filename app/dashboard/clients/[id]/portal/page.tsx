"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  ShieldOff,
} from "lucide-react";
import toast from "react-hot-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

// ─── Types ──────────────────────────────────────────────────────────────────

type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

interface Invitation {
  id: string;
  email: string;
  token: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

interface Client {
  id: string;
  name: string;
  email: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InvitationStatus }) {
  const configs: Record<
    InvitationStatus,
    { label: string; variant: string; icon: React.ReactNode }
  > = {
    PENDING: {
      label: "Pending",
      variant: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      icon: <Clock size={12} />,
    },
    ACCEPTED: {
      label: "Accepted",
      variant: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      icon: <CheckCircle size={12} />,
    },
    EXPIRED: {
      label: "Expired",
      variant: "bg-slate-500/20 text-slate-400 border-slate-500/30",
      icon: <XCircle size={12} />,
    },
    REVOKED: {
      label: "Revoked",
      variant: "bg-red-500/20 text-red-400 border-red-500/30",
      icon: <ShieldOff size={12} />,
    },
  };

  const cfg = configs[status] ?? configs.EXPIRED;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${cfg.variant}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClientPortalPage({
  params,
}: {
  params: { id: string };
}) {
  const clientId = params.id;

  const [client, setClient] = useState<Client | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingClient, setLoadingClient] = useState(true);
  const [loadingInvitations, setLoadingInvitations] = useState(true);

  // Send-invitation form state
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [expiryDays, setExpiryDays] = useState(7);
  const [sending, setSending] = useState(false);

  // Revoke confirmation state
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Per-row resend loading
  const [resendingId, setResendingId] = useState<string | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchClient = async () => {
    try {
      setLoadingClient(true);
      const res = await fetch(`/api/clients/${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setClient({ id: data.id, name: data.name, email: data.email });
        setEmail(data.email ?? "");
      } else {
        toast.error("Failed to load client details");
      }
    } catch {
      toast.error("Failed to load client details");
    } finally {
      setLoadingClient(false);
    }
  };

  const fetchInvitations = async () => {
    try {
      setLoadingInvitations(true);
      const res = await fetch(`/api/portal/invitations?clientId=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations ?? []);
      }
    } catch {
      // silent — empty state handles it
    } finally {
      setLoadingInvitations(false);
    }
  };

  useEffect(() => {
    fetchClient();
    fetchInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/portal/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, message: message.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invitation");
      toast.success("Invitation sent!");
      setMessage("");
      fetchInvitations();
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setSending(false);
    }
  };

  const handleResend = async (invId: string) => {
    setResendingId(invId);
    try {
      const res = await fetch(`/api/portal/invitations/${invId}/resend`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend invitation");
      toast.success("Invitation resent!");
      fetchInvitations();
    } catch (err: any) {
      toast.error(err.message || "Failed to resend invitation");
    } finally {
      setResendingId(null);
    }
  };

  const confirmRevoke = (invId: string) => setRevokeTargetId(invId);
  const cancelRevoke = () => setRevokeTargetId(null);

  const handleRevoke = async () => {
    if (!revokeTargetId) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/portal/invitations/${revokeTargetId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke invitation");
      }
      toast.success("Invitation revoked");
      setRevokeTargetId(null);
      fetchInvitations();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke invitation");
    } finally {
      setRevoking(false);
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────────

  const acceptedInvitation = invitations.find((i) => i.status === "ACCEPTED");
  const latestPending = invitations.find((i) => i.status === "PENDING");

  const portalUrl = `${typeof window !== "undefined" ? window.location.origin : "https://restoreassist.app"}/portal/login`;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back link + title */}
      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard/clients/${clientId}`}
          className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
          title="Back to client"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          {loadingClient ? (
            <Skeleton className="h-7 w-48 mb-1" />
          ) : (
            <h1 className="text-2xl font-semibold">
              Portal Access — {client?.name ?? "Client"}
            </h1>
          )}
          <p className="text-slate-400 text-sm">
            Manage portal invitations for this client
          </p>
        </div>
      </div>

      {/* Portal status card */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base font-medium text-white">
            Portal Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingInvitations ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : acceptedInvitation ? (
            <div className="flex items-start gap-3">
              <CheckCircle
                size={22}
                className="text-emerald-400 mt-0.5 shrink-0"
              />
              <div>
                <p className="font-medium text-emerald-400">Portal Active</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  {client?.name ?? "Client"} accepted the invitation on{" "}
                  {fmt(acceptedInvitation.acceptedAt)}.
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  Portal URL:{" "}
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    {portalUrl}
                  </a>
                </p>
              </div>
            </div>
          ) : latestPending ? (
            <div className="flex items-start gap-3">
              <Clock size={22} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-blue-400">Pending acceptance</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  Invitation sent to{" "}
                  <span className="text-slate-300">{latestPending.email}</span>.
                  Expires {fmt(latestPending.expiresAt)}.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-slate-400">
              <XCircle size={20} />
              <p className="text-sm">
                Portal not yet activated for this client.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send invitation form */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base font-medium text-white">
            Send Invitation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Email</Label>
                <Input
                  id="inv-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-expiry">Expires after (days)</Label>
                <Input
                  id="inv-expiry"
                  type="number"
                  min={1}
                  max={30}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value))}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-message">Personal message (optional)</Label>
              <textarea
                id="inv-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Add a personal note to include in the invitation email..."
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-md text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <Button
              type="submit"
              disabled={sending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {sending ? (
                <>
                  <RefreshCw size={15} className="mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={15} className="mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator className="border-slate-700/50" />

      {/* Invitations history table */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base font-medium text-white">
            Invitation History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingInvitations ? (
            <div className="px-6 py-4 space-y-3">
              {[1, 2].map((n) => (
                <div key={n} className="flex items-center gap-4">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24 ml-auto" />
                </div>
              ))}
            </div>
          ) : invitations.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Send size={36} className="mx-auto text-slate-500 mb-3" />
              <p className="text-slate-400 text-sm">
                No portal invitations sent yet for this client.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50 hover:bg-transparent">
                  <TableHead className="text-slate-400 font-medium">
                    Status
                  </TableHead>
                  <TableHead className="text-slate-400 font-medium">
                    Email
                  </TableHead>
                  <TableHead className="text-slate-400 font-medium">
                    Sent
                  </TableHead>
                  <TableHead className="text-slate-400 font-medium">
                    Expires
                  </TableHead>
                  <TableHead className="text-slate-400 font-medium">
                    Accepted
                  </TableHead>
                  <TableHead className="text-slate-400 font-medium text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="border-slate-700/50 hover:bg-slate-700/20"
                  >
                    <TableCell>
                      <StatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-slate-300 text-sm">
                      {inv.email}
                    </TableCell>
                    <TableCell className="text-slate-400 text-sm">
                      {fmt(inv.createdAt)}
                    </TableCell>
                    <TableCell className="text-slate-400 text-sm">
                      {fmt(inv.expiresAt)}
                    </TableCell>
                    <TableCell className="text-slate-400 text-sm">
                      {fmt(inv.acceptedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Resend — available for PENDING and EXPIRED */}
                        {(inv.status === "PENDING" ||
                          inv.status === "EXPIRED") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={resendingId === inv.id}
                            onClick={() => handleResend(inv.id)}
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 px-2 text-xs"
                          >
                            {resendingId === inv.id ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : (
                              <RefreshCw size={13} className="mr-1" />
                            )}
                            Resend
                          </Button>
                        )}
                        {/* Revoke — available for PENDING only */}
                        {inv.status === "PENDING" && (
                          <>
                            {revokeTargetId === inv.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-400 mr-1">
                                  Confirm?
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={revoking}
                                  onClick={handleRevoke}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2 text-xs"
                                >
                                  {revoking ? (
                                    <RefreshCw
                                      size={13}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    "Yes, revoke"
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={revoking}
                                  onClick={cancelRevoke}
                                  className="text-slate-400 hover:text-slate-300 h-7 px-2 text-xs"
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => confirmRevoke(inv.id)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2 text-xs"
                              >
                                <ShieldOff size={13} className="mr-1" />
                                Revoke
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Revoke confirm overlay (fallback if inline confirm isn't enough) */}
    </div>
  );
}
