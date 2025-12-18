"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { X, CheckCircle, Circle, ArrowRight, Crown, Key, Settings, AlertCircle, User, FileText } from "lucide-react"

interface OnboardingStatus {
  isComplete: boolean
  incompleteSteps: string[]
  nextStep: string | null
  steps: {
    business_profile: { completed: boolean; required: boolean; title: string; description: string; route: string }
    integrations: { completed: boolean; required: boolean; title: string; description: string; route: string }
    pricing_config: { completed: boolean; required: boolean; title: string; description: string; route: string }
    first_report: { completed: boolean; required: boolean; title: string; description: string; route: string }
  }
}

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
}

export default function OnboardingModal({ isOpen, onClose, onComplete }: OnboardingModalProps) {
  const router = useRouter()
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      fetchOnboardingStatus()
    }
  }, [isOpen])

  const fetchOnboardingStatus = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/onboarding/status')
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
        
        // If all steps are complete, call onComplete
        if (data.isComplete && onComplete) {
          onComplete()
        }
      }
    } catch (error) {
      console.error('Error fetching onboarding status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStepAction = (step: string) => {
    if (status?.steps[step as keyof typeof status.steps]) {
      const stepInfo = status.steps[step as keyof typeof status.steps]
      router.push(stepInfo.route)
        onClose()
    }
  }

  const getStepInfo = (step: string) => {
    if (!status?.steps[step as keyof typeof status.steps]) return null
    
    const stepData = status.steps[step as keyof typeof status.steps]
    
    switch (step) {
      case 'business_profile':
        return {
          title: stepData.title,
          description: stepData.description,
          icon: Settings,
          action: 'Setup Business Details',
          route: stepData.route
        }
      case 'integrations':
        return {
          title: stepData.title,
          description: stepData.description,
          icon: Key,
          action: 'Configure Integration',
          route: stepData.route
        }
      case 'pricing_config':
        return {
          title: stepData.title,
          description: stepData.description,
          icon: Settings,
          action: 'Configure Pricing',
          route: stepData.route
        }
      case 'first_report':
        return {
          title: stepData.title,
          description: stepData.description,
          icon: ArrowRight,
          action: 'Create Report',
          route: stepData.route
        }
      default:
        return null
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-lg">
              <AlertCircle className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Complete Your Setup</h2>
              <p className="text-sm text-slate-400">Finish these steps to start creating reports</p>
            </div>
          </div>
          {status?.isComplete ? (
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
          ) : (
            <div className="text-xs text-slate-500 px-2">
              Complete all steps
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
            </div>
          ) : status && !status.isComplete ? (
            <div className="space-y-4">
              <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-sm text-amber-400 font-medium">
                  ⚠️ You must complete all required steps before creating reports. Please complete the following steps to continue.
                </p>
              </div>

              {status.incompleteSteps.map((step, index) => {
                const stepInfo = getStepInfo(step)
                if (!stepInfo) return null

                const Icon = stepInfo.icon
                const isFirst = index === 0
                const isLast = index === status.incompleteSteps.length - 1

                return (
                  <div key={step} className="relative">
                    {/* Connector Line */}
                    {!isLast && (
                      <div className="absolute left-6 top-12 w-0.5 h-full bg-slate-700"></div>
                    )}

                    <div className="relative bg-slate-800/50 border border-slate-700 rounded-lg p-5 hover:border-cyan-500/50 transition-all">
                      <div className="flex items-start gap-4">
                        {/* Step Icon */}
                        <div className={`p-3 rounded-lg ${
                          isFirst 
                            ? 'bg-cyan-500/20 border-2 border-cyan-500' 
                            : 'bg-slate-700/50 border border-slate-600'
                        }`}>
                          <Icon className={`w-6 h-6 ${
                            isFirst ? 'text-cyan-400' : 'text-slate-400'
                          }`} />
                        </div>

                        {/* Step Content */}
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-white mb-1">
                                {stepInfo.title}
                              </h3>
                              <p className="text-sm text-slate-400 mb-4">
                                {stepInfo.description}
                              </p>
                            </div>
                          </div>

                          {/* Action Button */}
                          <button
                            onClick={() => handleStepAction(step)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                              isFirst
                                ? 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-lg shadow-cyan-500/20'
                                : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                            }`}
                          >
                            {stepInfo.action}
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Note: Cannot skip required steps */}
              <div className="mt-6 pt-6 border-t border-slate-700">
                <p className="text-xs text-slate-500 text-center">
                  All steps must be completed before creating reports
                </p>
              </div>
            </div>
          ) : status?.isComplete ? (
            <div className="text-center py-12">
              <div className="inline-flex p-4 bg-green-500/10 rounded-full mb-4">
                <CheckCircle className="w-12 h-12 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">All Set!</h3>
              <p className="text-slate-400 mb-6">You've completed all setup steps. You can now create reports.</p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors"
              >
                Get Started
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

