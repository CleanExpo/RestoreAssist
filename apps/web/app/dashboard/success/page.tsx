"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle, Loader2, ArrowRight, Zap, DollarSign, FileText, X, Sparkles, TrendingUp } from "lucide-react"
import toast from "react-hot-toast"
import { useSession } from "next-auth/react"

// Module-level flag to prevent verification from running multiple times across remounts
let globalVerificationComplete = false

export default function SuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, update } = useSession()
  const addonKey = searchParams.get('addon')
  const isAddonPurchase = !!addonKey
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(true)
  const [showSetupGuide, setShowSetupGuide] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const hasVerifiedRef = useRef(false)
  const isCompletedRef = useRef(false)
  const toastShownRef = useRef(false)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])
  const isProcessingRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Helper to safely set state only if not completed
  const safeSetState = (fn: () => void) => {
    if (!isCompletedRef.current && !isProcessingRef.current) {
      fn()
    }
  }

  // Helper to show toast only once
  const showToastOnce = (message: string) => {
    if (!toastShownRef.current && !isCompletedRef.current) {
      toastShownRef.current = true
      toast.success(message)
    }
  }

  // Helper to mark as completed
  const markCompleted = () => {
    if (!isCompletedRef.current) {
      isCompletedRef.current = true
      isProcessingRef.current = false
      globalVerificationComplete = true // Set global flag to persist across remounts
        setChecking(false)
        setLoading(false)
    }
  }

  useEffect(() => {
    // Only verify once - guard against re-runs (including across remounts)
    if (hasVerifiedRef.current || isCompletedRef.current || isProcessingRef.current || globalVerificationComplete) {
      // If globally completed, mark local state as complete too
      if (globalVerificationComplete && !isCompletedRef.current) {
        markCompleted()
      }
      return
    }

    // Extract session_id once (only on first run)
    if (sessionIdRef.current === null) {
      sessionIdRef.current = searchParams.get('session_id')
    }

    // Mark as processing immediately to prevent concurrent runs
    isProcessingRef.current = true
    hasVerifiedRef.current = true

    // Cleanup function to clear timeouts
    const cleanup = () => {
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout))
      timeoutRefs.current = []
    }

    const verifyAndUpdateSubscription = async () => {
      // FIRST: Check if subscription is already active before doing anything
      // This prevents re-running verification if component remounts after completion
      try {
        const preCheckResponse = await fetch('/api/user/profile')
        if (preCheckResponse.ok) {
          const preCheckData = await preCheckResponse.json()
          if (preCheckData.profile?.subscriptionStatus === 'ACTIVE') {
            // Already active, just mark as completed and return
            markCompleted()
            showToastOnce("Subscription activated successfully!")
            cleanup()
            return
          }
        }
      } catch (error) {
        // Continue with verification if pre-check fails
      }
      
      // Check if already completed (race condition guard)
      if (isCompletedRef.current) {
        cleanup()
        return
      }
      try {
        // Get session_id from ref
        const sessionId = sessionIdRef.current
        
        // If this is an add-on purchase, handle it first
        if (isAddonPurchase) {
          if (sessionId) {
            try {
              const addonVerifyResponse = await fetch('/api/addons/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
              })
              
              if (addonVerifyResponse.ok) {
                const addonData = await addonVerifyResponse.json()
                
                if (isCompletedRef.current) {
                  cleanup()
                  return
                }
                
                markCompleted()
                showToastOnce(`Add-on purchase successful! You now have ${addonData.addonReports} additional reports.`)
                cleanup()
                return
              } else {
                const errorData = await addonVerifyResponse.json().catch(() => ({}))
                // Continue to try finding session
              }
            } catch (addonError) {
              console.error('❌ Error verifying add-on:', addonError)
            }
          }
          
          // If no session_id, try to find recent add-on purchases
          try {
            // Wait a bit for webhook to process
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            // Check user profile to see if add-ons were updated
            const profileCheck = await fetch('/api/user/profile?refresh=true')
            if (profileCheck.ok) {
              const profileData = await profileCheck.json()
              const currentAddons = profileData.profile?.addonReports || 0
              
              if (currentAddons > 0) {
                if (isCompletedRef.current) {
                  cleanup()
                  return
                }
                markCompleted()
                showToastOnce(`Add-on purchase successful! You now have ${currentAddons} additional reports.`)
                cleanup()
                return
              }
            }
          } catch (error) {
            console.error('❌ Error checking add-on status:', error)
          }
          
          // If still not found, mark as completed anyway (webhook might process later)
          markCompleted()
          showToastOnce("Add-on purchase received! Processing may take a moment. Please refresh the page.")
          cleanup()
          return
        }
        
        if (!sessionId) {
          // Try checking active subscription directly first
          try {
            const checkResponse = await fetch('/api/check-active-subscription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            })
            
            if (checkResponse.ok) {
              if (isCompletedRef.current) {
                cleanup()
                return
              }
              
              const checkData = await checkResponse.json()
              
              // DON'T call update() here - it causes re-renders/remounts
              // Just mark as completed - session will update naturally
              markCompleted()
              showToastOnce("Subscription activated successfully!")
              cleanup()
              return
            }
          } catch (error) {
            console.error('Error checking active subscription:', error)
          }
          
          // Fallback to checking profile
          await checkProfileAndUpdate()
          cleanup()
          return
        }

        // First, wait a moment for webhook to process (if it fires quickly)
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        // Check if completed during wait
        if (isCompletedRef.current) {
          cleanup()
          return
        }
        
        // Check current profile status
        const profileResponse = await fetch('/api/user/profile')
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          if (profileData.profile.subscriptionStatus === 'ACTIVE') {
            // Already updated by webhook
            if (isCompletedRef.current) {
              cleanup()
              return
            }
            
            // DON'T call update() - it causes remounts
            markCompleted()
            showToastOnce("Subscription activated successfully!")
            cleanup()
            return
          }
        }

        // Check again if completed
        if (isCompletedRef.current) {
          cleanup()
          return
        }

        // If not updated yet, manually verify and update subscription
        const verifyResponse = await fetch('/api/verify-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        })

        if (verifyResponse.ok) {
          if (isCompletedRef.current) {
            cleanup()
            return
          }
          
          const verifyData = await verifyResponse.json()
          
          // DON'T call update() - it causes remounts and infinite loops
          markCompleted()
          showToastOnce("Subscription activated successfully!")
          cleanup()
        } else {
          // If verification fails, try checking active subscription directly
          const errorData = await verifyResponse.json().catch(() => ({ error: 'Unknown error' }))
          
          // Check if completed
          if (isCompletedRef.current) {
            cleanup()
            return
          }
          
          // Try to find and update subscription by checking Stripe customer
          const checkResponse = await fetch('/api/check-active-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
          
          if (checkResponse.ok) {
            if (isCompletedRef.current) {
              cleanup()
              return
            }
            
            const checkData = await checkResponse.json()
            
            // DON'T call update() - it causes remounts
            markCompleted()
            showToastOnce("Subscription activated successfully!")
            cleanup()
          } else {
            // If that also fails, wait a bit more for webhook
            if (isCompletedRef.current) {
              cleanup()
              return
            }
            
            const timeout = setTimeout(async () => {
              if (isCompletedRef.current) return
              await checkProfileAndUpdate()
            }, 3000)
            timeoutRefs.current.push(timeout)
          }
        }
      } catch (error) {
        console.error('Error verifying subscription:', error)
        // Fallback to checking profile
        if (!isCompletedRef.current) {
        await checkProfileAndUpdate()
        }
        cleanup()
      }
    }

    const checkProfileAndUpdate = async () => {
      // Guard against running if already completed
      if (isCompletedRef.current) {
        cleanup()
        return
      }
      
      try {
        const response = await fetch('/api/user/profile')
        if (response.ok && !isCompletedRef.current) {
          const data = await response.json()
          const profile = data.profile
          
          if (profile.subscriptionStatus === 'ACTIVE') {
            if (isCompletedRef.current) {
              cleanup()
              return
            }
            
            // DON'T call update() - it causes remounts
            markCompleted()
            showToastOnce("Subscription activated successfully!")
            cleanup()
          } else {
            // Try one more time after delay
            if (isCompletedRef.current) {
              cleanup()
              return
            }
            
            const timeout = setTimeout(async () => {
              if (isCompletedRef.current) {
                cleanup()
                return
              }
              
              const retryResponse = await fetch('/api/user/profile')
              if (retryResponse.ok && !isCompletedRef.current) {
                const retryData = await retryResponse.json()
                if (retryData.profile.subscriptionStatus === 'ACTIVE') {
                  if (isCompletedRef.current) {
                    cleanup()
                    return
                  }
                  
                  // DON'T call update() - it causes remounts
                  markCompleted()
                  showToastOnce("Subscription activated successfully!")
                  cleanup()
                } else {
                  if (isCompletedRef.current) {
                    cleanup()
                    return
                  }
                  markCompleted()
                  showToastOnce("Payment received! Your subscription is being processed. Please refresh in a moment.")
                  cleanup()
                }
              } else {
                if (isCompletedRef.current) {
                  cleanup()
                  return
                }
                markCompleted()
                cleanup()
              }
            }, 3000)
            timeoutRefs.current.push(timeout)
          }
        } else {
          if (isCompletedRef.current) {
            cleanup()
            return
          }
          markCompleted()
          cleanup()
        }
      } catch (error) {
        console.error('Error checking profile:', error)
        if (isCompletedRef.current) {
          cleanup()
          return
        }
        markCompleted()
        cleanup()
      }
    }

    verifyAndUpdateSubscription()
    
    // Return cleanup function
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps - effect should run only once on mount, guards prevent re-runs

  // Auto-redirect to subscription page for add-ons IMMEDIATELY (no modal shown)
  useEffect(() => {
    if (isAddonPurchase) {
      // Redirect immediately without showing any UI
      router.push('/dashboard/subscription?addon=success')
    }
  }, [isAddonPurchase, router])

  // For add-ons, don't show any UI - redirect immediately
  if (isAddonPurchase) {
    return null
  }

  // Auto-show setup guide after verification completes
  useEffect(() => {
    if (!loading && !checking && !isAddonPurchase && !isCompletedRef.current) {
      // Small delay to show success first
      const timer = setTimeout(() => {
        setShowSetupGuide(true)
        // Start countdown for auto-redirect
        countdownIntervalRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current)
              }
              // Call handleStartSetup directly
              if (!isRedirecting) {
                setIsRedirecting(true)
                update().then(() => {
                  router.push('/dashboard/integrations?onboarding=true')
                })
              }
              return 0
            }
            return prev - 1
          })
        }, 1000)
      }, 2000)
      return () => {
        clearTimeout(timer)
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current)
        }
      }
    }
  }, [loading, checking, isAddonPurchase, router, update])

  const handleStartSetup = async () => {
    if (isRedirecting) return
    setIsRedirecting(true)
    await update()
    router.push('/dashboard/integrations?onboarding=true')
  }

  const handleSkipSetup = async () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
    }
    setShowSetupGuide(false)
    await update()
    toast.success("Setup skipped! You can complete it anytime from Settings or the sidebar.", {
      duration: 4000,
      icon: "ℹ️"
    })
    // Redirect to dashboard after a moment
    setTimeout(() => {
      router.push('/dashboard')
    }, 1500)
  }

  if (loading || checking) {
    return (
      <div className="h-screen overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto" />
          <p className="text-gray-600 dark:text-slate-300">
            Processing your subscription...
          </p>
        </div>
      </div>
    )
  }

  const setupSteps = [
    {
      number: 1,
      icon: Zap,
      title: "Connect API Key",
      description: "Add your Anthropic API key to enable AI-powered report generation",
      impact: "High Impact",
      impactColor: "text-emerald-600 dark:text-emerald-400",
      impactBg: "bg-emerald-50 dark:bg-emerald-500/10",
      details: "Personalizes report generation, enables advanced AI features, and improves report quality",
      route: "/dashboard/integrations?onboarding=true",
      timeEstimate: "2 min"
    },
    {
      number: 2,
      icon: DollarSign,
      title: "Configure Pricing",
      description: "Set up your business rates for labour, equipment, and services",
      impact: "High Impact",
      impactColor: "text-emerald-600 dark:text-emerald-400",
      impactBg: "bg-emerald-50 dark:bg-emerald-500/10",
      details: "Ensures accurate cost estimations and professional quotes for your clients",
      route: "/dashboard/pricing-config?onboarding=true",
      timeEstimate: "5 min"
    },
    {
      number: 3,
      icon: FileText,
      title: "Create First Report",
      description: "Generate your first professional restoration report",
      impact: "Medium Impact",
      impactColor: "text-blue-600 dark:text-blue-400",
      impactBg: "bg-blue-50 dark:bg-blue-500/10",
      details: "Test the system and see how reports are generated with your settings",
      route: "/dashboard/reports/new?onboarding=true",
      timeEstimate: "10 min"
    }
  ]

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      {/* Success Message */}
      {!showSetupGuide && (
        <div className="max-w-lg w-full bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700/50 rounded-lg p-6 text-center space-y-5 shadow-lg dark:shadow-none animate-fade-in">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center animate-scale-in">
              <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
            </div>
          </div>
          
          <div className="space-y-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payment Successful!</h1>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Thank you for your subscription. Your account has been upgraded and you now have unlimited access.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setShowSetupGuide(true)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
            >
              Start Setup Guide
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Setup Guide Modal */}
      {showSetupGuide && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="max-w-2xl w-full bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 p-6 rounded-t-xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                    <Sparkles className="text-white" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Complete Your Setup</h2>
                    <p className="text-sm text-gray-500 dark:text-slate-400">3 quick steps to get started</p>
                  </div>
                </div>
                <button
                  onClick={handleSkipSetup}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-gray-500 dark:text-slate-400"
                  title="Skip Setup"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-slate-400 text-center">
                Complete these steps to unlock the full potential of your account. Each step takes just a few minutes.
              </p>

              {/* Setup Steps */}
              <div className="space-y-4">
                {setupSteps.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <div
                      key={step.number}
                      className="group relative p-5 rounded-xl border-2 border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:border-cyan-500 dark:hover:border-cyan-500 hover:shadow-lg transition-all duration-300"
                    >
                      <div className="flex items-start gap-4">
                        {/* Step Number & Icon */}
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
                            <Icon className="text-white" size={24} />
                          </div>
                          <div className="mt-2 text-center">
                            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Step {step.number}</span>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h3 className="font-bold text-gray-900 dark:text-white text-lg">{step.title}</h3>
                              <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{step.description}</p>
                            </div>
                            <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${step.impactBg} ${step.impactColor}`}>
                              {step.impact}
                            </div>
                          </div>

                          {/* Impact Details */}
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                            <TrendingUp size={14} />
                            <span>{step.details}</span>
                          </div>

                          {/* Time Estimate */}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-slate-700">
                            <span className="text-xs text-gray-500 dark:text-slate-400">
                              ⏱️ Est. {step.timeEstimate}
                            </span>
                            <button
                              onClick={async () => {
                                await update()
                                router.push(step.route)
                              }}
                              className="px-4 py-1.5 text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all flex items-center gap-2 group/btn"
                            >
                              Start
                              <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Auto-redirect Info */}
              <div className="mt-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <p className="text-sm text-gray-700 dark:text-slate-300">
                      {countdown > 0 ? (
                        <>Auto-starting setup in <strong className="text-blue-600 dark:text-blue-400">{countdown}</strong> seconds...</>
                      ) : (
                        <span className="text-blue-600 dark:text-blue-400 font-medium">Redirecting...</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={handleStartSetup}
                    disabled={isRedirecting}
                    className="px-4 py-2 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    {isRedirecting ? "Redirecting..." : "Start Now"}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="sticky bottom-0 bg-gray-50 dark:bg-slate-800/80 border-t border-gray-200 dark:border-slate-700 p-6 rounded-b-xl backdrop-blur-sm">
              <div className="flex gap-3">
                <button
                  onClick={handleSkipSetup}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300 font-medium"
                >
                  Skip Setup
                </button>
                <button
                  onClick={async () => {
                    await update()
                    router.push('/dashboard/subscription')
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300 font-medium"
                >
                  View Subscription
                </button>
              </div>
              <p className="text-xs text-center text-gray-500 dark:text-slate-400 mt-3">
                You can complete setup anytime from Settings or the sidebar
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

