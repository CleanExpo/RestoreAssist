"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle, Loader2 } from "lucide-react"
import toast from "react-hot-toast"

export default function SuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [checking, setChecking] = useState(true)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const response = await fetch('/api/subscription/check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setSuccess(true)
            toast.success('Subscription activated successfully!')
          } else {
            toast.error('Subscription not found. Please try refreshing.')
          }
        } else {
          toast.error('Failed to verify subscription')
        }
      } catch (error) {
        console.error('Error checking subscription:', error)
        toast.error('Failed to verify subscription')
      } finally {
        setChecking(false)
      }
    }

    // Check subscription status
    checkSubscription()
  }, [])

  const handleContinue = () => {
    router.push('/dashboard/subscription')
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-cyan-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-white mb-2">Verifying Subscription</h2>
          <p className="text-slate-400">Please wait while we verify your subscription...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-6">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">
            {success ? 'Payment Successful!' : 'Payment Processed'}
          </h1>
          <p className="text-slate-400 mb-8">
            {success 
              ? 'Your subscription has been activated successfully. You now have access to all premium features.'
              : 'Your payment has been processed. Your subscription will be activated shortly.'
            }
          </p>
          <button
            onClick={handleContinue}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
