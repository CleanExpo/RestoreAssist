"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Info, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import toast from "react-hot-toast"
import { signInWithGoogleFirebase } from "@/lib/firebase-google-auth"

export default function SignupPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [accountType, setAccountType] = useState<"admin" | "technician">("admin")
  const [inviteToken, setInviteToken] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [shouldRedirect, setShouldRedirect] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (shouldRedirect) {
      const timer = setTimeout(() => {
        window.location.href = "/dashboard"
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [shouldRedirect])

  // Support invite links: /signup?invite=TOKEN
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const token = params.get("invite")
    if (token) {
      setAccountType("technician")
      setInviteToken(token)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    // Validation
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
          signupType: accountType,
          inviteToken: accountType === "technician" ? inviteToken.trim() : undefined,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("Account created successfully!")
        // Auto sign in after successful registration
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        })

        if (result?.ok) {
          toast.success("Welcome to Restore Assist!")
          // Redirect to dashboard with onboarding - simplified flow for free users
          router.push("/dashboard?onboarding=true")
        } else {
          toast.error("Please sign in manually")
          setTimeout(() => {
            window.location.href = "/login"
          }, 1000)
        }
      } else {
        setError(data.error || "Registration failed")
      }
    } catch (error) {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError("")
    try {
      // Use Firebase Google authentication
      const googleUser = await signInWithGoogleFirebase()
      
      // User is now created/updated in database via /api/auth/google-signin
      // Sign in with NextAuth using credentials (email only, no password for Google users)
      toast.success("Signing you in...")
      
      // Small delay to ensure database write is complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Sign in with NextAuth using credentials (email only, no password for Google users)
      const signInResult = await signIn("credentials", {
        email: googleUser.email || "",
        password: "", // Empty password - our updated CredentialsProvider handles this
        redirect: false,
      })

      if (signInResult?.ok) {
        toast.success("Welcome to Restore Assist!")
        router.push("/dashboard")
      } else {
        console.error("Sign in result:", signInResult)
        const errorMsg = signInResult?.error || "Failed to create session"
        toast.error("Failed to create session. Please try logging in manually.")
        setError(errorMsg)
        // Fallback: redirect to login with email pre-filled
        setTimeout(() => {
          router.push("/login?email=" + encodeURIComponent(googleUser.email || ""))
        }, 2000)
      }
    } catch (error: any) {
      console.error("Google sign-in error:", error)
      const errorMessage = error.message || "Google sign-in failed. Please try again."
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
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
        <div className="text-center mb-6">
          <motion.h1
            className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent mb-2"
            style={{ fontFamily: 'Titillium Web, sans-serif' }}
          >
            Restore Assist          </motion.h1>
          <p className="text-slate-400">Create your account</p>
        </div>

        {/* Information Box */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-6 bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4"
        >
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-cyan-400" />
              <span className="text-cyan-400 font-medium">What you'll need after signup</span>
            </div>
            {showInfo ? (
              <ChevronUp className="w-5 h-5 text-cyan-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-cyan-400" />
            )}
          </button>
          
          {showInfo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-3 text-sm text-slate-300"
            >
              <div>
                <p className="font-semibold text-cyan-300 mb-1">1. Start Creating Reports (Free Tier Available)</p>
                <p className="text-slate-400">Get started immediately with 3 free report credits. Create basic reports right away!</p>
              </div>
              
              <div>
                <p className="font-semibold text-cyan-300 mb-1">2. Upgrade for Premium Features</p>
                <p className="text-slate-400 mb-2">Unlock powerful features when you're ready:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-400 ml-2">
                  <li>Unlimited Quick Fill (AI-powered form auto-fill)</li>
                  <li>Enhanced & Optimized report types</li>
                  <li>PDF upload and processing</li>
                  <li>Full profile and pricing configuration</li>
                  <li>Premium API integrations</li>
                </ul>
              </div>
              
              <div>
                <p className="font-semibold text-cyan-300 mb-1">3. Optional: Setup Business Profile</p>
                <p className="text-slate-400">Add your business details to personalize your reports (available after upgrade).</p>
              </div>
              
              <div>
                <p className="font-semibold text-cyan-300 mb-1">4. Optional: Configure Pricing</p>
                <p className="text-slate-400">Set your company's rates for accurate cost estimates (available after upgrade).</p>
              </div>
              
              <div className="pt-2 border-t border-cyan-500/20">
                <p className="text-xs text-slate-400">
                  💡 <strong>Tip:</strong> You can complete these steps after signing up. We'll guide you through the process!
                </p>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Signup Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Account Type */}
            {/* <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Account Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAccountType("admin")}
                  className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    accountType === "admin"
                      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                      : "border-slate-600/50 bg-slate-700/30 text-slate-300 hover:bg-slate-700/50"
                  }`}
                >
                  Admin / Owner
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType("technician")}
                  className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    accountType === "technician"
                      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                      : "border-slate-600/50 bg-slate-700/30 text-slate-300 hover:bg-slate-700/50"
                  }`}
                >
                  Technician
                </button>
              </div>

            </div> */}

            {/* Name Field */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                Full Name
              </label>
              <div className="relative">
                <User size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-300"
                  placeholder="Enter your full name"
                  required
                />
              </div>
            </div>

            {/* Email Field */}
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

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-300"
                  placeholder="Create a password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Confirm Password Field */}
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
                  placeholder="Confirm your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Submit Button */}
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
                  Create Account
                  <ArrowRight size={20} />
                </>
              )}
            </motion.button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-slate-600/50" />
            <span className="px-4 text-slate-400 text-sm">or</span>
            <div className="flex-1 border-t border-slate-600/50" />
          </div>

          {/* Google Sign In */}
          <motion.button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 bg-white/10 border border-slate-600/50 rounded-xl font-medium text-white hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{ fontFamily: 'Titillium Web, sans-serif' }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </motion.button>

          {/* Sign In Link */}
          <div className="mt-6 text-center">
            <p className="text-slate-400">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
              >
                Sign in
              </Link>
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}