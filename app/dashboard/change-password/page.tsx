"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle } from "lucide-react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"

export default function ChangePasswordPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{
    currentPassword?: string
    newPassword?: string
    confirmPassword?: string
  }>({})

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  // Check if user actually needs to change password
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      if (!session.user.mustChangePassword) {
        // User doesn't need to change password, redirect to dashboard
        router.push("/dashboard")
      }
    }
  }, [status, session, router])

  const validatePassword = (password: string): string[] => {
    const errors: string[] = []
    if (password.length < 8) {
      errors.push("Password must be at least 8 characters long")
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter")
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter")
    }
    if (!/[0-9]/.test(password)) {
      errors.push("Password must contain at least one number")
    }
    return errors
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrors({})

    // Validation
    const newErrors: typeof errors = {}

    if (!currentPassword) {
      newErrors.currentPassword = "Current password is required"
    }

    const passwordValidationErrors = validatePassword(newPassword)
    if (passwordValidationErrors.length > 0) {
      newErrors.newPassword = passwordValidationErrors[0]
    }

    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || "Failed to change password")
        if (data.error?.includes("Current password")) {
          setErrors({ currentPassword: data.error })
        }
        return
      }

      toast.success("Password changed successfully! Redirecting...")
      
      // Refresh session to update mustChangePassword flag
      setTimeout(() => {
        window.location.href = "/dashboard"
      }, 1500)
    } catch (error) {
      console.error("Change password error:", error)
      toast.error("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (status === "loading") {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", "bg-white dark:bg-slate-950")}>
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (status === "unauthenticated") {
    return null
  }

  const passwordValidationErrors = validatePassword(newPassword)
  const passwordMeetsRequirements = newPassword.length > 0 && passwordValidationErrors.length === 0
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0

  return (
    <div className={cn("min-h-screen flex items-center justify-center px-4 py-12", "bg-white dark:bg-slate-950")}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        <div className={cn(
          "bg-white dark:bg-slate-900 border rounded-2xl p-8 shadow-xl",
          "border-neutral-200 dark:border-slate-800"
        )}>
          <div className="text-center mb-8">
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
              "bg-amber-100 dark:bg-amber-900/30"
            )}>
              <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className={cn("text-2xl font-bold mb-2", "text-neutral-900 dark:text-neutral-50")}>
              Change Your Password
            </h1>
            <p className={cn("text-sm", "text-neutral-600 dark:text-neutral-400")}>
              For security reasons, please set a new password for your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Current Password */}
            <div>
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value)
                    setErrors((prev) => ({ ...prev, currentPassword: undefined }))
                  }}
                  className={cn(
                    "w-full px-4 py-3 pr-12 rounded-lg border",
                    "bg-white dark:bg-slate-800",
                    "border-neutral-300 dark:border-slate-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent",
                    errors.currentPassword && "border-rose-500 dark:border-rose-500"
                  )}
                  placeholder="Enter your current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2",
                    "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  )}
                >
                  {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {errors.currentPassword && (
                <p className="mt-1 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {errors.currentPassword}
                </p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    setErrors((prev) => ({ ...prev, newPassword: undefined }))
                  }}
                  className={cn(
                    "w-full px-4 py-3 pr-12 rounded-lg border",
                    "bg-white dark:bg-slate-800",
                    "border-neutral-300 dark:border-slate-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent",
                    errors.newPassword && "border-rose-500 dark:border-rose-500",
                    passwordMeetsRequirements && !errors.newPassword && "border-green-500 dark:border-green-500"
                  )}
                  placeholder="Enter your new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2",
                    "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  )}
                >
                  {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {newPassword.length > 0 && (
                <div className="mt-2 space-y-1">
                  {passwordValidationErrors.map((error, idx) => (
                    <p key={idx} className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {error}
                    </p>
                  ))}
                  {passwordMeetsRequirements && (
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle size={12} />
                      Password meets all requirements
                    </p>
                  )}
                </div>
              )}
              {errors.newPassword && (
                <p className="mt-1 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {errors.newPassword}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    setErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                  }}
                  className={cn(
                    "w-full px-4 py-3 pr-12 rounded-lg border",
                    "bg-white dark:bg-slate-800",
                    "border-neutral-300 dark:border-slate-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent",
                    errors.confirmPassword && "border-rose-500 dark:border-rose-500",
                    passwordsMatch && !errors.confirmPassword && "border-green-500 dark:border-green-500"
                  )}
                  placeholder="Confirm your new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2",
                    "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  )}
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {passwordsMatch && (
                <p className="mt-1 text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle size={14} />
                  Passwords match
                </p>
              )}
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !passwordMeetsRequirements || !passwordsMatch || !currentPassword}
              className={cn(
                "w-full py-3 rounded-lg font-semibold transition-all",
                "bg-gradient-to-r from-cyan-600 to-blue-600",
                "hover:from-cyan-700 hover:to-blue-700",
                "text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
              )}
            >
              {isLoading ? "Changing Password..." : "Change Password"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
