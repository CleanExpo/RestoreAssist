"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// RA-1215 — invite/edit flows previously surfaced field errors via toast
// (email missing, invalid format, server "already exists") which disappear
// after 4s on long forms. Validation + server 400 field errors now render
// inline via shadcn <FormMessage>. Network / 5xx keeps toast.
const inviteFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  role: z.enum(["USER", "MANAGER"]),
});
type InviteFormValues = z.infer<typeof inviteFormSchema>;

function apiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return fallback;
  }
  const error = payload.error;
  if (typeof error === "string") return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}
import {
  Users,
  UserPlus,
  Mail,
  Copy,
  Check,
  Clock,
  UserCog,
  Wrench,
  Search,
  Send,
  Crown,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import TeamActivityFeed from "./components/TeamActivityFeed";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Member = {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "MANAGER" | "USER";
  managedById: string | null;
  createdAt: string;
};

type Invite = {
  id: string;
  email: string;
  role: "MANAGER" | "USER";
  token: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  createdById: string;
  managedById: string | null;
};

const roleConfig = {
  ADMIN: {
    label: "Admin",
    icon: Crown,
    color: "",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    textColor: "text-purple-700 dark:text-purple-300",
    borderColor: "border-purple-200",
  },
  MANAGER: {
    label: "Manager",
    icon: UserCog,
    color: "",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-700 dark:text-blue-300",
    borderColor: "border-blue-200",
  },
  USER: {
    label: "Technician",
    icon: Wrench,
    color: "",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    textColor: "text-cyan-700 dark:text-cyan-300",
    borderColor: "border-cyan-200",
  },
};

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function TeamPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const isManager = session?.user?.role === "MANAGER";
  const isTechnician = session?.user?.role === "USER";
  const canInvite = isAdmin || isManager;
  const canViewInvites = isAdmin || isManager;
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "ALL" | "ADMIN" | "MANAGER" | "USER"
  >("ALL");

  const [creating, setCreating] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const inviteForm = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: "", role: "USER" },
    mode: "onBlur",
  });
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const resendIdempotencyKeys = useRef(new Map<string, string>());
  const createInviteIdempotencyKey = useRef<string | null>(null);

  // Credentials modal state
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentials, setCredentials] = useState<{
    email: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<"email" | null>(null);

  // Remove member state
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  // Role change state
  const [changingRoleFor, setChangingRoleFor] = useState<string | null>(null);

  const inviteLinkBase = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/invite/`;
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [mRes, iRes] = await Promise.all([
        fetch("/api/team/members"),
        canViewInvites ? fetch("/api/team/invites") : Promise.resolve(null),
      ]);
      const mJson = await mRes.json();
      if (mRes.ok) setMembers(mJson.members || []);
      else toast.error(apiErrorMessage(mJson, "Failed to load team"));
      if (iRes) {
        const iJson = await iRes.json();
        if (iRes.ok) setInvites(iJson.invites || []);
        else toast.error(apiErrorMessage(iJson, "Failed to load invites"));
      } else {
        setInvites([]);
      }
    } catch {
      toast.error("Failed to load team data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user) load();
  }, [session?.user?.role]);

  // Managers can only invite Technicians: when opening invite form as Manager, force role to Technician
  useEffect(() => {
    if (showInviteForm && session?.user?.role === "MANAGER") {
      inviteForm.setValue("role", "USER");
    }
  }, [showInviteForm, session?.user?.role, inviteForm]);

  const createInvite = inviteForm.handleSubmit(async (values) => {
    const inviteEmail = values.email.trim();
    const inviteRole = values.role;
    setCreating(true);
    const idempotencyKey =
      createInviteIdempotencyKey.current ?? globalThis.crypto.randomUUID();
    createInviteIdempotencyKey.current = idempotencyKey;
    let receivedResponse = false;
    let completedResponse = false;
    try {
      const res = await fetch("/api/team/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      receivedResponse = true;
      completedResponse = res.ok;
      const json = await res.json().catch(() => ({}));

      if (json.partial) {
        toast.error(
          json.message ?? "The change was saved, but the email could not be sent.",
          { duration: 6000 },
        );
        inviteForm.reset({ email: "", role: "USER" });
        setShowInviteForm(false);
        await load();
        return;
      }
      if (!res.ok) {
        // RA-1215 — 4xx field errors render inline against the offending
        // field; generic / 5xx falls back to toast.
        const message = apiErrorMessage(json, "Failed to create invite");
        if (res.status >= 400 && res.status < 500) {
          const lower = String(message).toLowerCase();
          if (lower.includes("email")) {
            inviteForm.setError("email", { type: "server", message });
          } else if (lower.includes("role")) {
            inviteForm.setError("role", { type: "server", message });
          } else {
            inviteForm.setError("root", { type: "server", message });
          }
        } else {
          toast.error(message);
        }
        return;
      }
      // Same-organization existing users may have been role-updated. New-user
      // invites do not expose credentials and therefore do not open this modal.
      let credentialsData = null;

      if (json.user?.email) {
        credentialsData = {
          email: json.user.email,
        };
      }

      // Show modal if we have at least an email
      if (credentialsData && credentialsData.email) {
        // Set both states together - React will batch these updates
        setCredentials({ email: credentialsData.email });
        setShowCredentialsModal(true);

        if (json.updated) {
          toast.success(
            `Membership updated. Notification email sent to ${credentialsData.email}.`,
            { duration: 5000 },
          );
        } else {
          toast.success(`Notification email sent to ${credentialsData.email}.`, {
            duration: 5000,
          });
        }
      } else {
        const userEmail = json.invite?.email || json.user?.email || inviteEmail;
        toast.success(
          `Secure invitation sent to ${userEmail}.`,
          { duration: 5000 },
        );
      }

      inviteForm.reset({ email: "", role: "USER" });
      setShowInviteForm(false);
      await load();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not reach the server. Please try again.";
      inviteForm.setError("root", { type: "network", message });
      toast.error(message);
    } finally {
      if (receivedResponse && completedResponse) {
        createInviteIdempotencyKey.current = null;
      }
      setCreating(false);
    }
  });

  const copyInviteLink = async (token: string, inviteId: string) => {
    const link = `${inviteLinkBase}${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedInviteId(inviteId);
      toast.success("Invite link copied to clipboard!");
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const copyCredentials = async () => {
    if (!credentials) return;

    try {
      await navigator.clipboard.writeText(credentials.email);
      setCopiedField("email");
      toast.success("Email copied to clipboard!");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const resendEmail = async (invite: Invite) => {
    let idempotencyKey = resendIdempotencyKeys.current.get(invite.id);
    if (!idempotencyKey) {
      idempotencyKey = globalThis.crypto.randomUUID();
      resendIdempotencyKeys.current.set(invite.id, idempotencyKey);
    }
    setResendingEmail(invite.id);
    let receivedResponse = false;
    let completedResponse = false;
    try {
      const res = await fetch(`/api/team/invites/${invite.id}/resend`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      });
      receivedResponse = true;
      completedResponse = res.ok;

      const data = await res.json().catch(() => ({}));
      if (data.partial) {
        toast.error(
          data.message ?? "Invite updated, but the email could not be sent.",
        );
        await load();
        return;
      }
      if (!res.ok) {
        throw new Error(apiErrorMessage(data, "Failed to resend email"));
      }

      toast.success(`Email resent to ${invite.email}!`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to resend email",
      );
    } finally {
      // A rejected fetch is ambiguous: the server may have committed and the
      // response may have been lost. Retain the same key so the next click
      // replays the server receipt instead of sending a duplicate email.
      if (receivedResponse && completedResponse) {
        resendIdempotencyKeys.current.delete(invite.id);
      }
      setResendingEmail(null);
    }
  };

  const removeMember = async () => {
    if (!memberToRemove) return;

    setRemoving(true);
    try {
      const res = await fetch(`/api/team/members/${memberToRemove.id}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(apiErrorMessage(json, "Failed to remove team member"));
        return;
      }

      toast.success(json.message || "Team member removed successfully");
      setMemberToRemove(null);
      await load();
    } catch {
      toast.error("Failed to remove team member");
    } finally {
      setRemoving(false);
    }
  };

  const changeRole = async (memberId: string, newRole: "USER" | "MANAGER") => {
    setChangingRoleFor(memberId);
    // Optimistic update
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
    );
    try {
      const res = await fetch(`/api/team/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(apiErrorMessage(json, "Failed to change role"));
        // Revert optimistic update on failure
        await load();
        return;
      }
      toast.success(json.message || "Role updated successfully");
    } catch {
      toast.error("Failed to change role");
      await load();
    } finally {
      setChangingRoleFor(null);
    }
  };

  // Filter members and invites
  const filteredMembers = useMemo(() => {
    let filtered = members;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.name?.toLowerCase().includes(query) ||
          m.email.toLowerCase().includes(query) ||
          roleConfig[m.role].label.toLowerCase().includes(query),
      );
    }

    if (roleFilter !== "ALL") {
      filtered = filtered.filter((m) => m.role === roleFilter);
    }

    return filtered;
  }, [members, searchQuery, roleFilter]);

  const filteredInvites = useMemo(() => {
    let filtered = invites;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.email.toLowerCase().includes(query) ||
          roleConfig[inv.role].label.toLowerCase().includes(query),
      );
    }

    if (roleFilter !== "ALL") {
      filtered = filtered.filter((inv) => inv.role === roleFilter);
    }

    return filtered;
  }, [invites, searchQuery, roleFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalMembers = members.length;
    const activeInvites = invites.filter(
      (inv) => !inv.usedAt && new Date(inv.expiresAt).getTime() > Date.now(),
    ).length;
    const admins = members.filter((m) => m.role === "ADMIN").length;
    const managers = members.filter((m) => m.role === "MANAGER").length;
    const technicians = members.filter((m) => m.role === "USER").length;

    return { totalMembers, activeInvites, admins, managers, technicians };
  }, [members, invites]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center min-h-[400px]")}>
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-cyan-500" />
          <p
            className={cn("text-sm", "text-neutral-600 dark:text-neutral-400")}
          >
            Loading team data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className={cn(
              "text-2xl sm:text-3xl font-bold",
              "text-neutral-900 dark:text-neutral-50",
            )}
          >
            Team Management
          </h1>
          <p
            className={cn(
              "text-xs sm:text-sm mt-1",
              "text-neutral-600 dark:text-neutral-400",
            )}
          >
            {isTechnician
              ? "View your organisation's team members and hierarchy."
              : "Manage your team members and invitations."}
          </p>
        </div>
        {canInvite && (
          <Button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="bg-brand-navy text-white shadow-lg w-full sm:w-auto"
          >
            <UserPlus className="w-4 h-4" />
            {showInviteForm ? "Cancel" : "Invite Member"}
          </Button>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Card
            className={cn(
              "border-2",
              "border-neutral-200 dark:border-neutral-800",
              "bg-white dark:bg-neutral-900/50",
            )}
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      "text-neutral-600 dark:text-neutral-400",
                    )}
                  >
                    Total Members
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-bold mt-1",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  >
                    {stats.totalMembers}
                  </p>
                </div>
                <div
                  className={cn(
                    "p-3 rounded-full",
                    "bg-blue-100 dark:bg-blue-900/30",
                  )}
                >
                  <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {canViewInvites && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 delay-100">
            <Card
              className={cn(
                "border-2",
                "border-neutral-200 dark:border-neutral-800",
                "bg-white dark:bg-neutral-900/50",
              )}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className={cn(
                        "text-sm font-medium",
                        "text-neutral-600 dark:text-neutral-400",
                      )}
                    >
                      Active Invites
                    </p>
                    <p
                      className={cn(
                        "text-2xl font-bold mt-1",
                        "text-neutral-900 dark:text-neutral-50",
                      )}
                    >
                      {stats.activeInvites}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "p-3 rounded-full",
                      "bg-cyan-100 dark:bg-cyan-900/30",
                    )}
                  >
                    <Mail className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 delay-200">
          <Card
            className={cn(
              "border-2",
              "border-neutral-200 dark:border-neutral-800",
              "bg-white dark:bg-neutral-900/50",
            )}
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      "text-neutral-600 dark:text-neutral-400",
                    )}
                  >
                    Managers
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-bold mt-1",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  >
                    {stats.managers}
                  </p>
                </div>
                <div
                  className={cn(
                    "p-3 rounded-full",
                    "bg-blue-100 dark:bg-blue-900/30",
                  )}
                >
                  <UserCog className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 delay-300">
          <Card
            className={cn(
              "border-2",
              "border-neutral-200 dark:border-neutral-800",
              "bg-white dark:bg-neutral-900/50",
            )}
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      "text-neutral-600 dark:text-neutral-400",
                    )}
                  >
                    Technicians
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-bold mt-1",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  >
                    {stats.technicians}
                  </p>
                </div>
                <div
                  className={cn(
                    "p-3 rounded-full",
                    "bg-cyan-100 dark:bg-cyan-900/30",
                  )}
                >
                  <Wrench className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Invite Form */}
      {showInviteForm && canInvite && (
        <div className="overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <Card
            className={cn(
              "border-2",
              "border-cyan-200",
              "bg-brand-navy",
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                Invite New Team Member
              </CardTitle>
              <CardDescription>
                A secure invitation link valid for 7 days will be sent. New
                members set their own password when they accept.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...inviteForm}>
                <form onSubmit={createInvite} noValidate>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <FormField
                        control={inviteForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email Address</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                                <input
                                  type="email"
                                  placeholder="colleague@example.com"
                                  className={cn(
                                    "w-full pl-10 pr-4 py-2.5 rounded-lg text-sm",
                                    "bg-white dark:bg-neutral-800",
                                    "border border-neutral-300 dark:border-neutral-700",
                                    "text-neutral-900 dark:text-neutral-50",
                                    "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent",
                                  )}
                                  {...field}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div>
                      <FormField
                        control={inviteForm.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role</FormLabel>
                            <FormControl>
                              <select
                                className={cn(
                                  "w-full px-4 py-2.5 rounded-lg text-sm",
                                  "bg-white dark:bg-neutral-800",
                                  "border border-neutral-300 dark:border-neutral-700",
                                  "text-neutral-900 dark:text-neutral-50",
                                  "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent",
                                )}
                                disabled={isManager}
                                {...field}
                              >
                                <option value="USER">Technician</option>
                                {isAdmin && (
                                  <option value="MANAGER">Manager</option>
                                )}
                              </select>
                            </FormControl>
                            <FormMessage />
                            {isManager && (
                              <p
                                className={cn(
                                  "text-xs mt-1",
                                  "text-neutral-500 dark:text-neutral-400",
                                )}
                              >
                                Managers can only invite Technicians.
                              </p>
                            )}
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  {inviteForm.formState.errors.root && (
                    <p className="text-destructive text-sm mt-3" role="alert">
                      {inviteForm.formState.errors.root.message}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-4">
                    <Button
                      type="submit"
                      disabled={creating}
                      className="bg-brand-navy text-white"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Send Invitation
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowInviteForm(false)}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or role..."
            className={cn(
              "w-full pl-10 pr-4 py-2 rounded-lg text-sm",
              "bg-white dark:bg-neutral-800",
              "border border-neutral-300 dark:border-neutral-700",
              "text-neutral-900 dark:text-neutral-50",
              "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent",
            )}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={roleFilter === "ALL" ? "default" : "outline"}
            onClick={() => setRoleFilter("ALL")}
            size="sm"
          >
            All
          </Button>
          <Button
            variant={roleFilter === "ADMIN" ? "default" : "outline"}
            onClick={() => setRoleFilter("ADMIN")}
            size="sm"
          >
            <Crown className="w-3 h-3 mr-1" />
            Admin
          </Button>
          <Button
            variant={roleFilter === "MANAGER" ? "default" : "outline"}
            onClick={() => setRoleFilter("MANAGER")}
            size="sm"
          >
            <UserCog className="w-3 h-3 mr-1" />
            Manager
          </Button>
          <Button
            variant={roleFilter === "USER" ? "default" : "outline"}
            onClick={() => setRoleFilter("USER")}
            size="sm"
          >
            <Wrench className="w-3 h-3 mr-1" />
            Technician
          </Button>
        </div>
      </div>

      {/* Members Section */}
      <Card
        className={cn(
          "border-2",
          "border-neutral-200 dark:border-neutral-800",
          "bg-white dark:bg-neutral-900/50",
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Members ({filteredMembers.length})
          </CardTitle>
          <CardDescription>Active members in your organisation</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredMembers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-neutral-400 mb-4" />
              <p
                className={cn(
                  "text-sm font-medium",
                  "text-neutral-600 dark:text-neutral-400",
                )}
              >
                {searchQuery || roleFilter !== "ALL"
                  ? "No members match your filters"
                  : "No team members yet"}
              </p>
              {!searchQuery && roleFilter === "ALL" && (
                <p
                  className={cn(
                    "text-xs mt-1",
                    "text-neutral-500 dark:text-neutral-500",
                  )}
                >
                  Invite your first team member to get started
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMembers.map((member, idx) => {
                const config = roleConfig[member.role];
                const Icon = config.icon;
                return (
                  <div
                    key={member.id}
                    className="animate-in fade-in slide-in-from-bottom-4 duration-300"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <Card
                      className={cn(
                        "border-2 transition-all hover:shadow-lg hover:scale-[1.02]",
                        config.borderColor,
                        "bg-white dark:bg-neutral-900",
                      )}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm",
                                `bg-brand-navy text-white shadow-lg`,
                              )}
                            >
                              {getInitials(member.name, member.email)}
                            </div>
                            <div>
                              <p
                                className={cn(
                                  "font-semibold",
                                  "text-neutral-900 dark:text-neutral-50",
                                )}
                              >
                                {member.name || "No name"}
                              </p>
                              <p
                                className={cn(
                                  "text-xs mt-0.5",
                                  "text-neutral-600 dark:text-neutral-400",
                                )}
                              >
                                {member.email}
                              </p>
                            </div>
                          </div>
                          <Badge
                            className={cn(
                              "flex items-center gap-1",
                              config.bgColor,
                              config.textColor,
                              config.borderColor,
                            )}
                          >
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <div
                            className={cn(
                              "flex items-center gap-2 text-xs",
                              "text-neutral-500 dark:text-neutral-400",
                            )}
                          >
                            <Calendar className="w-3 h-3" />
                            Joined {formatDate(member.createdAt)}
                          </div>
                          {isAdmin &&
                            member.role !== "ADMIN" &&
                            member.id !== session?.user?.id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMemberToRemove(member)}
                                className="text-xs text-destructive-subtle-foreground hover:text-destructive-subtle-foreground dark:hover:text-rose-300 hover:bg-destructive-subtle dark:hover:bg-rose-950/20 border-destructive-subtle-foreground/30"
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                                Remove
                              </Button>
                            )}
                        </div>
                        {isAdmin &&
                          member.role !== "ADMIN" &&
                          member.id !== session?.user?.id && (
                            <div className="mt-3 flex items-center gap-2">
                              <label
                                className={cn(
                                  "text-xs font-medium",
                                  "text-neutral-500 dark:text-neutral-400",
                                )}
                              >
                                Role:
                              </label>
                              <select
                                value={member.role}
                                disabled={changingRoleFor === member.id}
                                onChange={(e) =>
                                  changeRole(
                                    member.id,
                                    e.target.value as "USER" | "MANAGER",
                                  )
                                }
                                className={cn(
                                  "flex-1 px-2 py-1 rounded-md text-xs",
                                  "bg-white dark:bg-neutral-800",
                                  "border border-neutral-300 dark:border-neutral-700",
                                  "text-neutral-900 dark:text-neutral-50",
                                  "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent",
                                  "disabled:opacity-50 disabled:cursor-not-allowed",
                                )}
                              >
                                <option value="USER">Technician</option>
                                <option value="MANAGER">Manager</option>
                              </select>
                              {changingRoleFor === member.id && (
                                <Loader2 className="w-3 h-3 animate-spin text-cyan-500 shrink-0" />
                              )}
                            </div>
                          )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credentials Modal - explicit light/dark text for visibility */}
      <Dialog
        open={showCredentialsModal}
        onOpenChange={setShowCredentialsModal}
      >
        <DialogContent
          className={cn(
            "sm:max-w-md",
            "bg-white dark:bg-neutral-900",
            "text-neutral-900 dark:text-neutral-100",
            "border-neutral-200 dark:border-neutral-700",
          )}
        >
          <DialogHeader>
            <DialogTitle
              className={cn(
                "flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-100",
              )}
            >
              <CheckCircle2 className="w-5 h-5 text-success" />
              User Membership Updated
            </DialogTitle>
            <DialogDescription
              className={cn("text-neutral-600 dark:text-neutral-400")}
            >
              This existing member can continue using their current account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Email Field */}
            <div className="space-y-2">
              <label
                className={cn(
                  "text-sm font-medium",
                  "text-neutral-700 dark:text-neutral-300",
                )}
              >
                Email / Username
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={credentials?.email || ""}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg border font-mono text-sm",
                    "bg-neutral-100 dark:bg-slate-800/50 border-neutral-300 dark:border-slate-600",
                    "text-neutral-900 dark:text-white",
                    "focus:outline-none focus:ring-2 focus:ring-cyan-500",
                  )}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyCredentials}
                  className="shrink-0"
                >
                  {copiedField === "email" ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Info Box - explicit contrast for light mode */}
            <div
              className={cn(
                "p-3 rounded-lg border",
                "bg-amber-50 dark:bg-amber-900/20 border-amber-200",
              )}
            >
              <p
                className={cn(
                  "text-xs font-medium",
                  "text-amber-900 dark:text-amber-200",
                )}
              >
                <strong>Note:</strong> This user already has an account. They
                can log in with their existing credentials. A notification
                email has been sent to {credentials?.email || "the user"}.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              onClick={() => {
                setShowCredentialsModal(false);
                setCredentials(null);
                setCopiedField(null);
              }}
              className="w-full sm:w-auto"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Remove Team Member
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>{memberToRemove?.name || memberToRemove?.email}</strong>{" "}
              from your team?
              <br />
              <br />
              This will remove them from your organisation. They will no longer
              have access to team resources, but their account will remain
              active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={removeMember}
              disabled={removing}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {removing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove Member
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invites Section - Only visible to Admin and Manager */}
      {canViewInvites && (
        <Card
          className={cn(
            "border-2",
            "border-neutral-200 dark:border-neutral-800",
            "bg-white dark:bg-neutral-900/50",
          )}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Invitations ({filteredInvites.length})
            </CardTitle>
            <CardDescription>
              New accounts are created only after the recipient accepts their
              secure invitation and sets a password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredInvites.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="w-12 h-12 mx-auto text-neutral-400 mb-4" />
                <p
                  className={cn(
                    "text-sm font-medium",
                    "text-neutral-600 dark:text-neutral-400",
                  )}
                >
                  {searchQuery || roleFilter !== "ALL"
                    ? "No invites match your filters"
                    : "No invitations yet"}
                </p>
                {!searchQuery && roleFilter === "ALL" && (
                  <p
                    className={cn(
                      "text-xs mt-1",
                      "text-neutral-500 dark:text-neutral-500",
                    )}
                  >
                    Create an invitation to add a new team member
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInvites.map((invite, idx) => {
                  const config = roleConfig[invite.role];
                  const Icon = config.icon;
                  const isUsed = Boolean(invite.usedAt);
                  const isExpired =
                    new Date(invite.expiresAt).getTime() < Date.now();
                  const isActive = !isUsed && !isExpired;

                  return (
                    <div
                      key={invite.id}
                      className="animate-in fade-in slide-in-from-left-5 duration-300"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <Card
                        className={cn(
                          "border-2 transition-all",
                          isActive
                            ? "border-cyan-200 bg-cyan-50/50 dark:bg-cyan-950/20"
                            : isUsed
                              ? "border-green-200 bg-green-50/50 dark:bg-green-950/20"
                              : "border-rose-200 bg-rose-50/50 dark:bg-rose-950/20",
                          "hover:shadow-md",
                        )}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div
                                  className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold",
                                    `bg-brand-navy text-white`,
                                  )}
                                >
                                  {invite.email.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p
                                    className={cn(
                                      "font-medium",
                                      "text-neutral-900 dark:text-neutral-50",
                                    )}
                                  >
                                    {invite.email}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-xs",
                                        config.textColor,
                                        config.borderColor,
                                      )}
                                    >
                                      <Icon className="w-3 h-3 mr-1" />
                                      {config.label}
                                    </Badge>
                                    {isUsed ? (
                                      <Badge
                                        variant="outline"
                                        className="text-xs text-green-600 dark:text-green-400 border-green-200"
                                      >
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Account Created
                                      </Badge>
                                    ) : isExpired ? (
                                      <Badge
                                        variant="outline"
                                        className="text-xs text-rose-600 dark:text-rose-400 border-rose-200"
                                      >
                                        <AlertCircle className="w-3 h-3 mr-1" />
                                        Expired
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="text-xs text-cyan-600 dark:text-cyan-400 border-cyan-200"
                                      >
                                        <Clock className="w-3 h-3 mr-1" />
                                        Active
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div
                                className={cn(
                                  "flex items-center gap-4 text-xs mt-2",
                                  "text-neutral-500 dark:text-neutral-400",
                                )}
                              >
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(invite.createdAt)}
                                </span>
                                {!isUsed && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Expires {formatDate(invite.expiresAt)}
                                  </span>
                                )}
                              </div>
                              {!isUsed && canInvite && (
                                <div className="mt-3 flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      copyInviteLink(invite.token, invite.id)
                                    }
                                    className="text-xs"
                                  >
                                    {copiedInviteId === invite.id ? (
                                      <>
                                        <Check className="w-3 h-3 mr-1" />
                                        Copied!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3 mr-1" />
                                        Copy Link
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => resendEmail(invite)}
                                    disabled={resendingEmail === invite.id}
                                    className="text-xs"
                                  >
                                    {resendingEmail === invite.id ? (
                                      <>
                                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                        Sending...
                                      </>
                                    ) : (
                                      <>
                                        <Send className="w-3 h-3 mr-1" />
                                        Resend Email
                                      </>
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team Activity – Admin/Manager: comprehensive activity from managers and technicians */}
      {canViewInvites && (
        <div className="space-y-3">
          <div>
            <h2
              className={cn(
                "text-xl font-semibold",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              Team Activity
            </h2>
            <p
              className={cn(
                "text-sm mt-0.5",
                "text-neutral-600 dark:text-neutral-400",
              )}
            >
              {isAdmin
                ? "All activity from your managers and technicians: reports, inspections, guided interviews, and invites."
                : "All activity from your technicians: reports, inspections, and guided interviews."}
            </p>
          </div>
          <TeamActivityFeed />
        </div>
      )}
    </div>
  );
}
