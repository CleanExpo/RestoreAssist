"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle, Loader2, ArrowRight } from "lucide-react"
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
  const hasVerifiedRef = useRef(false)
  const isCompletedRef = useRef(false)
  const toastShownRef = useRef(false)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])
  const isProcessingRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)

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

  if (loading || checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto" />
          <p className="text-slate-300">
            Processing your subscription...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800/50 border border-slate-700/50 rounded-lg p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-green-400" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Payment Successful!</h1>
          <p className="text-slate-400">
            {isAddonPurchase 
              ? `Your add-on pack has been added to your account. You can now create additional reports this month.`
              : `Thank you for your subscription. Your account has been upgraded and you now have unlimited access.`
            }
          </p>
        </div>

        <div className="pt-4 space-y-3">
          <button
            onClick={() => {
              if (isAddonPurchase) {
                router.push('/dashboard/subscription?addon=success')
              } else {
                // Redirect to onboarding flow after subscription
                router.push('/dashboard/settings?onboarding=true')
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
          >
            {isAddonPurchase ? 'View Subscription' : 'Continue Setup'}
            <ArrowRight className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => router.push(isAddonPurchase ? '/dashboard/subscription?addon=success' : '/dashboard/settings')}
            className="w-full px-6 py-3 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-slate-300"
          >
            {isAddonPurchase ? 'View Subscription Details' : 'View Subscription Details'}
          </button>
        </div>
      </div>
    </div>
  )
}

