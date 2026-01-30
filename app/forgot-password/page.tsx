"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Mail, Lock, ArrowRight, ArrowLeft, CheckCircle, Eye, EyeOff, ShieldCheck } from "lucide-react"
import toast from "react-hot-toast"

function ForgotPasswordForm() {
  const [step, setStep] = useState<"email" | "code" | "password">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()
  const searchParams = useSearchParams()

  // Pre-fill email if coming from login
  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(emailParam)
    }
  }, [searchParams])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("If an account exists, a verification code has been generated.")
        setStep("code")
      } else if (response.status === 429) {
        setError("Too many attempts. Please try again later.")
        toast.error("Too many attempts. Please try again later.")
      } else {
        // Show generic message to prevent email enumeration
        toast.success("If an account exists, a verification code has been generated.")
        setStep("code")
      }
    } catch (error) {
      setError("An error occurred. Please try again.")
      toast.error("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    // Validation
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters")
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword, code }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("Password reset successfully! Redirecting to login...")
        setTimeout(() => {
          router.push("/login")
        }, 1500)
      } else {
        setError(data.error || "Failed to reset password")
        toast.error(data.error || "Failed to reset password")
        // If code was invalid/expired, go back to code step
        if (data.error?.includes('code') || data.error?.includes('expired')) {
          setCode("")
        }
        setIsLoading(false)
      }
    } catch (error) {
      setError("An error occurred. Please try again.")
      toast.error("An error occurred. Please try again.")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.h1
            className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent mb-2"
            style={{ fontFamily: 'Titillium Web, sans-serif' }}
          >
            Restore Assist
          </motion.h1>
          <p className="text-slate-400">
            {step === "email" ? "Reset your password" : step === "code" ? "Enter verification code" : "Set a new password"}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {["email", "code", "password"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step === s ? 'bg-cyan-500 text-white' :
                ["email", "code", "password"].indexOf(step) > i ? 'bg-emerald-500 text-white' :
                'bg-slate-700 text-slate-400'
              }`}>
                {["email", "code", "password"].indexOf(step) > i ? <CheckCircle size={16} /> : i + 1}
              </div>
              {i < 2 && <div className={`w-8 h-0.5 ${["email", "code", "password"].indexOf(step) > i ? 'bg-emerald-500' : 'bg-slate-700'}`} />}
            </div>
          ))}
        </div>

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8"
        >
          {step === "email" ? (
            <form onSubmit={handleEmailSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-300"
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{ fontFamily: 'Titillium Web, sans-serif' }}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Send Verification Code
                    <ArrowRight size={20} />
                  </>
                )}
              </motion.button>
            </form>
          ) : step === "code" ? (
            <form onSubmit={(e) => { e.preventDefault(); setStep("password"); }} className="space-y-6">
              <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg flex items-center gap-2">
                <Mail size={20} className="text-blue-400 flex-shrink-0" />
                <span className="text-blue-300 text-sm">
                  A verification code has been generated for <strong>{email}</strong>. Check the server console.
                </span>
              </div>

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-slate-300 mb-2">
                  Verification Code
                </label>
                <div className="relative">
                  <ShieldCheck size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-300 text-center text-2xl tracking-[0.5em] font-mono"
                    placeholder="000000"
                    required
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={code.length !== 6}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{ fontFamily: 'Titillium Web, sans-serif' }}
              >
                Continue
                <ArrowRight size={20} />
              </motion.button>

              <button
                type="button"
                onClick={() => { setStep("email"); setError(""); setCode(""); }}
                className="w-full text-sm text-slate-400 hover:text-cyan-400 transition-colors"
              >
                Didn't receive a code? Try again
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-2">
                <CheckCircle size={20} className="text-green-400" />
                <span className="text-green-400 text-sm">Code verified. Set your new password.</span>
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-slate-300 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-300"
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">Must be at least 8 characters</p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-300"
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{ fontFamily: 'Titillium Web, sans-serif' }}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Reset Password
                    <ArrowRight size={20} />
                  </>
                )}
              </motion.button>
            </form>
          )}

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} />
              Back to Login
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    }>
      <ForgotPasswordForm />
    </Suspense>
  )
}
