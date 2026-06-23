"use client";

import { useState, useEffect } from "react";
import {
  User,
  Mail,
  Calendar,
  CreditCard,
  Crown,
  Zap,
  Shield,
  Download,
  Bell,
  Key,
  Trash2,
  Edit,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { isCapacitorIOS } from "@/lib/capacitor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import BillingGate from "@/components/capacitor/BillingGate";

const SUBSCRIPTION_STATUS_TONES: Record<string, StatusTone> = {
  ACTIVE: "success",
  TRIAL: "info",
  CANCELED: "warning",
  EXPIRED: "danger",
  PAST_DUE: "warning",
};

interface UserProfile {
  id: string;
  name: string;
  email: string;
  image?: string;
  createdAt: string;
  subscriptionStatus: "TRIAL" | "ACTIVE" | "CANCELED" | "EXPIRED" | "PAST_DUE";
  subscriptionPlan?: string;
  creditsRemaining: number;
  totalCreditsUsed: number;
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  lastBillingDate?: string;
  nextBillingDate?: string;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });
  // RA-1842 — Hide "Manage Subscription" button on iOS shell (Apple 3.1.1).
  // Tracked separately from auth hydration so the button is suppressed on
  // first paint inside the iOS shell, eliminating the external-purchase CTA.
  const [hideBillingEntry, setHideBillingEntry] = useState(false);
  useEffect(() => {
    setHideBillingEntry(isCapacitorIOS());
  }, []);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [biometricLock, setBiometricLock] = useState(false);
  useEffect(() => {
    setBiometricLock(localStorage.getItem("ra-biometric-lock") === "true");
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      fetchProfile();
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status, session]);

  const fetchProfile = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    }

    // RA-1206 — on API failure, surface the real error rather than silently
    // rendering a TRIAL + 3-credit stub. Session user name/email still populate
    // the form so the user can edit contact details while we reflect the
    // outage honestly in the subscription panel.
    try {
      const response = await fetch("/api/user/profile");
      if (response.ok) {
        const data = await response.json();
        setProfile(data.profile);
        setProfileError(null);
        setFormData({
          name: data.profile.name || session?.user?.name || "",
          email: data.profile.email || session?.user?.email || "",
        });
      } else {
        setProfile(null);
        setProfileError(
          `Profile unavailable (HTTP ${response.status}). Subscription, credits, and billing dates can't be shown right now.`,
        );
        setFormData({
          name: session?.user?.name || "",
          email: session?.user?.email || "",
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
      setProfileError(
        `Profile unavailable: ${
          error instanceof Error ? error.message : "network error"
        }. Subscription, credits, and billing dates can't be shown right now.`,
      );
      setFormData({
        name: session?.user?.name || "",
        email: session?.user?.email || "",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success("Profile updated successfully");
        setEditing(false);
        fetchProfile();
      } else {
        toast.error("Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    }
  };

  // Refresh profile when the user returns to this tab — avoids hammering
  // /api/user/profile ~720×/hr per open tab (the old setInterval(5000)
  // pattern). Credits only change on explicit user action (purchase, usage)
  // so on-visibility is the right trigger.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchProfile();
    };
    const onFocus = () => {
      fetchProfile();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const getStatusText = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "Active";
      case "TRIAL":
        return "Free Trial";
      case "CANCELED":
        return "Canceled";
      case "EXPIRED":
        return "Expired";
      case "PAST_DUE":
        return "Past Due";
      default:
        return "Unknown";
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold text-white mb-2">
          Please log in
        </h2>
        <p className="text-slate-400">
          You need to be logged in to view your profile.
        </p>
      </div>
    );
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE MY ACCOUNT") return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to delete account");
        return;
      }
      toast.success("Account deleted");
      window.location.href = "/";
    } catch {
      toast.error("Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Settings & Profile</h1>
          <p className="text-slate-400">
            Manage your account settings and subscription
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchProfile(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          {!hideBillingEntry && (
            <button
              onClick={() => (window.location.href = "/dashboard/subscription")}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Manage Subscription
            </button>
          )}
        </div>
      </div>

      {/* RA-1206 — surface profile API failure instead of silently rendering stub */}
      {profileError && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10 text-warning"
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium mb-1">Couldn't load your profile</p>
            <p className="text-sm opacity-90">{profileError}</p>
          </div>
          <button
            type="button"
            onClick={() => fetchProfile(true)}
            disabled={refreshing}
            className="flex-shrink-0 px-3 py-1.5 text-sm border border-amber-500/40 rounded-md hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            {refreshing ? "Retrying..." : "Retry"}
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Profile Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <User className="w-5 h-5" />
                Personal Information
              </h2>
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
              >
                <Edit className="w-4 h-4" />
                {editing ? "Cancel" : "Edit"}
              </button>
            </div>

            <div className="space-y-4">
              {/* User Avatar */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-semibold text-xl">
                  {profile?.image ? (
                    <img
                      src={profile.image}
                      alt="Profile"
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    profile?.name?.charAt(0) ||
                    session?.user?.name?.charAt(0) ||
                    "U"
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {profile?.name || session?.user?.name || "User Name"}
                  </h3>
                  <p className="text-slate-400 text-sm">
                    {profile?.email ||
                      session?.user?.email ||
                      "user@example.com"}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Full Name
                </label>
                {editing ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                ) : (
                  <p className="text-slate-300">
                    {profile?.name || session?.user?.name || "Not provided"}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Email Address
                </label>
                {editing ? (
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                ) : (
                  <p className="text-slate-300">
                    {profile?.email || session?.user?.email || "Not provided"}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Member Since
                </label>
                <p className="text-slate-300">
                  {formatDate(profile?.createdAt) || "Recently"}
                </p>
              </div>

              {editing && (
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleUpdateProfile}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Account Actions */}
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Key className="w-5 h-5" />
              Account Actions
            </h2>

            <div className="space-y-4">
              <button type="button" className="w-full flex items-center gap-3 px-4 py-3 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors touch-manipulation">
                <Bell className="w-4 h-4" />
                <span>Notification Preferences</span>
              </button>

              <button type="button" className="w-full flex items-center gap-3 px-4 py-3 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors touch-manipulation">
                <Download className="w-4 h-4" />
                <span>Export Data</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="w-full flex items-center gap-3 px-4 py-3 border border-red-600 text-destructive rounded-lg hover:bg-red-600/10 transition-colors touch-manipulation"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </div>

        {/* Subscription & Credits Sidebar — hidden on iOS (Apple 3.1.1(b)) */}
        <BillingGate fallback={null}>
        <div className="space-y-6">
          {/* Subscription Status */}
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Crown className="w-5 h-5" />
              Subscription
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <StatusBadge
                  tone={
                    SUBSCRIPTION_STATUS_TONES[
                      profile?.subscriptionStatus ?? "TRIAL"
                    ] ?? "neutral"
                  }
                >
                  {getStatusText(profile?.subscriptionStatus || "TRIAL")}
                </StatusBadge>
              </div>

              {profile?.subscriptionPlan && (
                <div>
                  <label className="block text-sm font-medium mb-2">Plan</label>
                  <p className="text-slate-300">{profile.subscriptionPlan}</p>
                </div>
              )}

              {profile?.trialEndsAt && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Trial Ends
                  </label>
                  <p className="text-slate-300">
                    {formatDate(profile.trialEndsAt)}
                  </p>
                </div>
              )}

              {profile?.nextBillingDate && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Next Billing
                  </label>
                  <p className="text-slate-300">
                    {formatDate(profile.nextBillingDate)}
                  </p>
                </div>
              )}

              {!hideBillingEntry && (
                <a
                  href="/dashboard/subscription"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                >
                  <CreditCard className="w-4 h-4" />
                  Manage Subscription
                </a>
              )}
            </div>
          </div>

          {/* Credits */}
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Credits
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Remaining
                </label>
                <div className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
                  {refreshing && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {profile?.creditsRemaining || 0}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Used This Month
                </label>
                <div className="text-lg text-slate-300">
                  {profile?.totalCreditsUsed || 0}
                </div>
              </div>

              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, ((profile?.totalCreditsUsed || 0) / ((profile?.totalCreditsUsed || 0) + (profile?.creditsRemaining || 0))) * 100)}%`,
                  }}
                ></div>
              </div>

              {!hideBillingEntry && (
                <a
                  href="/pricing"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-yellow-500/50 transition-all"
                >
                  <Crown className="w-4 h-4" />
                  Upgrade Package
                </a>
              )}
            </div>
          </div>

          {/* Security */}
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Security
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">
                  Two-Factor Authentication
                </span>
                <span className="text-xs text-slate-500">Not enabled</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Login Sessions</span>
                <span className="text-xs text-slate-500">1 active</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Last Login</span>
                <span className="text-xs text-slate-500">Today</span>
              </div>

              {isCapacitorIOS() && (
                <div className="flex items-center justify-between">
                  <label htmlFor="biometric-lock" className="text-sm text-slate-300 cursor-pointer">
                    Require Face ID to unlock
                  </label>
                  <input
                    id="biometric-lock"
                    type="checkbox"
                    checked={biometricLock}
                    onChange={(e) => {
                      localStorage.setItem(
                        "ra-biometric-lock",
                        String(e.target.checked),
                      );
                      setBiometricLock(e.target.checked);
                    }}
                    className="w-4 h-4 accent-cyan-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        </BillingGate>
      </div>

      <Dialog open={showDeleteModal} onOpenChange={(open) => { setShowDeleteModal(open); if (!open) setDeleteConfirmText(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              This permanently deletes your account and all associated data. Type{" "}
              <strong>DELETE MY ACCOUNT</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE MY ACCOUNT"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== "DELETE MY ACCOUNT" || isDeleting}
              onClick={handleDeleteAccount}
            >
              {isDeleting ? "Deleting…" : "Delete Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
