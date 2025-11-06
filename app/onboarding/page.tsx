"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Key, CheckCircle, AlertCircle, Eye, EyeOff, ExternalLink, Sparkles } from "lucide-react"
import toast from "react-hot-toast"

export default function OnboardingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle')

  // Handle authentication and onboarding redirects
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      // Redirect to login if not authenticated
      if (status === 'unauthenticated') {
        router.push('/login')
        return
      }

      // Check if already completed onboarding
      if (status === 'authenticated') {
        try {
          const response = await fetch('/api/user/onboarding-status')
          if (response.ok) {
            const data = await response.json()
            if (data.hasCompletedOnboarding) {
              router.push('/dashboard')
            }
          }
        } catch (error) {
          console.error('Error checking onboarding status:', error)
        }
      }
    }
    checkOnboardingStatus()
  }, [status, router])

  const validateApiKey = async (key: string) => {
    if (!key || key.length < 20) {
      setValidationStatus('idle')
      return
    }

    setIsValidating(true)
    try {
      // Basic format validation for Anthropic API keys
      if (key.startsWith('sk-ant-')) {
        setValidationStatus('valid')
      } else {
        setValidationStatus('invalid')
      }
    } catch (error) {
      setValidationStatus('invalid')
    } finally {
      setIsValidating(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      validateApiKey(apiKey)
    }, 500)
    return () => clearTimeout(timer)
  }, [apiKey])

  const handleSaveApiKey = async () => {
    if (validationStatus !== 'valid') {
      toast.error('Please enter a valid Anthropic API key')
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch('/api/user/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      })

      if (response.ok) {
        toast.success('API key saved successfully!')
        setTimeout(() => {
          router.push('/dashboard')
        }, 1000)
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to save API key')
      }
    } catch (error) {
      console.error('Error saving API key:', error)
      toast.error('Failed to save API key')
    } finally {
      setIsSaving(false)
    }
  }

  // Show loading state while checking auth
  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-2xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 mb-6"
          >
            <Sparkles className="w-10 h-10 text-white" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent mb-3"
          >
            Welcome to RestoreAssist!
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-lg text-slate-400 max-w-xl mx-auto"
          >
            To get started, please add your Anthropic API key. This allows the AI orchestrator to generate your professional restoration reports.
          </motion.p>
        </div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8"
        >
          {/* API Key Input */}
          <div className="mb-6">
            <label htmlFor="apiKey" className="block text-sm font-medium text-slate-300 mb-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                Anthropic API Key
              </div>
            </label>

            <div className="relative">
              <input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full px-4 py-4 pr-12 bg-slate-900/50 border border-slate-600 rounded-xl focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all font-mono text-sm"
                disabled={isSaving}
              />

              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
              >
                {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>

              {/* Validation Indicator */}
              {validationStatus !== 'idle' && (
                <div className="absolute right-14 top-1/2 transform -translate-y-1/2">
                  {isValidating ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-500"></div>
                  ) : validationStatus === 'valid' ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>
              )}
            </div>

            {/* Validation Messages */}
            {validationStatus === 'valid' && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-sm text-emerald-400 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Valid API key format
              </motion.p>
            )}

            {validationStatus === 'invalid' && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-sm text-red-400 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4" />
                Invalid API key format. Should start with "sk-ant-"
              </motion.p>
            )}
          </div>

          {/* Info Box */}
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <h3 className="text-sm font-semibold text-blue-400 mb-2">How to get your API key:</h3>
            <ol className="text-sm text-slate-300 space-y-2 ml-4 list-decimal">
              <li>Visit <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline inline-flex items-center gap-1">console.anthropic.com <ExternalLink className="w-3 h-3" /></a></li>
              <li>Sign up or log in to your account</li>
              <li>Navigate to API Keys section</li>
              <li>Create a new API key</li>
              <li>Copy and paste it above</li>
            </ol>
          </div>

          {/* Security Notice */}
          <div className="mb-6 p-4 bg-slate-700/30 border border-slate-600/30 rounded-xl">
            <div className="flex gap-3">
              <Key className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-1">Your API key is secure</h4>
                <p className="text-xs text-slate-400">
                  Your API key is encrypted and stored securely. We never share your key with third parties. You remain in full control of your Anthropic usage and billing.
                </p>
              </div>
            </div>
          </div>

          {/* Continue Button */}
          <button
            onClick={handleSaveApiKey}
            disabled={validationStatus !== 'valid' || isSaving}
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Continue to Dashboard
              </>
            )}
          </button>

          {/* Skip Link */}
          <div className="mt-4 text-center">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              I'll add this later
            </button>
          </div>
        </motion.div>

        {/* Footer Note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-sm text-slate-500 mt-6"
        >
          Need help? Visit our <a href="/help" className="text-cyan-400 hover:text-cyan-300 underline">help centre</a>
        </motion.p>
      </motion.div>
    </div>
  )
}
