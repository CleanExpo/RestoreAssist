"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { apiErrorMessage } from "@/lib/api-error-message";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token");

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invitationValid, setInvitationValid] = useState(false);
  const [invitationData, setInvitationData] = useState<any>(null);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  // Verify invitation token on mount
  useEffect(() => {
    if (!token) {
      setError("No invitation token provided");
      setVerifying(false);
      setLoading(false);
      return;
    }

    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const response = await fetch(
        `/api/portal/invitations/verify?token=${token}`,
      );
      const data = await response.json();

      if (data.valid) {
        setInvitationValid(true);
        setInvitationData(data.invitation);
        // Pre-fill client name if available
        if (data.invitation.clientName) {
          setFormData((prev) => ({
            ...prev,
            name: data.invitation.clientName,
          }));
        }
      } else {
        setError(apiErrorMessage(data) ?? "Invalid invitation");
      }
    } catch (err) {
      setError("Failed to verify invitation");
    } finally {
      setVerifying(false);
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.name || !formData.password) {
      setError("Name and password are required");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);

    try {
      // Accept invitation and create account
      const response = await fetch("/api/portal/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: formData.password,
          name: formData.name,
          phone: formData.phone || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      toast.success("Account created successfully!");

      // Sign in automatically
      const signInResult = await signIn("client-credentials", {
        email: invitationData.email,
        password: formData.password,
        redirect: false,
      });

      if (signInResult?.error) {
        toast.error(
          "Account created but login failed. Please try logging in manually.",
        );
        router.push("/portal/login");
      } else {
        router.push("/portal");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create account");
      toast.error(err.message || "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-cloud">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-bronze mx-auto mb-4"></div>
          <p className="text-brand-slate">Verifying invitation...</p>
        </div>
      </div>
    );
  }

  if (!invitationValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-cloud px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center"
        >
          <div className="mb-6">
            <Image
              src="/logo.png"
              alt="RestoreAssist"
              width={80}
              height={80}
              className="mx-auto"
            />
          </div>
          <h1 className="text-2xl font-bold text-brand-navy mb-4">
            Invalid Invitation
          </h1>
          <p className="text-brand-slate mb-6">{error}</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-brand-bronze text-white rounded-lg hover:bg-brand-bronze/90 transition-colors"
          >
            Return to Home
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cloud px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-lg shadow-lg p-8"
      >
        <div className="mb-6 text-center">
          <Image
            src="/logo.png"
            alt="RestoreAssist"
            width={80}
            height={80}
            className="mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-brand-navy mb-2">
            Create Your Portal Account
          </h1>
          <p className="text-brand-slate text-sm">
            {invitationData.contractorName} has invited you to access the Client
            Portal
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive-subtle border border-destructive-subtle-foreground/30 rounded-lg text-destructive-subtle-foreground text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-navy mb-1">
              Email
            </label>
            <input
              type="email"
              value={invitationData.email}
              disabled
              className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg bg-brand-cloud text-brand-slate"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-navy mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:border-transparent"
              placeholder="John Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-navy mb-1">
              Phone (Optional)
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:border-transparent"
              placeholder="+61 400 000 000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-navy mb-1">
              Password *
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              required
              minLength={8}
              className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:border-transparent"
              placeholder="At least 8 characters"
            />
            <p className="text-xs text-brand-slate mt-1">Minimum 8 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-navy mb-1">
              Confirm Password *
            </label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
              required
              minLength={8}
              className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:border-transparent"
              placeholder="Re-enter password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-brand-bronze text-white rounded-lg font-medium hover:bg-brand-bronze/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating Account..." : "Create Account & Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-brand-slate">
          Already have an account?{" "}
          <Link href="/portal/login" className="text-brand-bronze hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function PortalSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-brand-cloud">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-bronze mx-auto mb-4"></div>
            <p className="text-brand-slate">Loading...</p>
          </div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
