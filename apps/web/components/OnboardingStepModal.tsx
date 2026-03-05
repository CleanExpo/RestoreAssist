"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { X, CheckCircle, Circle, ArrowRight, Sparkles } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface OnboardingStepModalProps {
  step: number
  totalSteps: number
  title: string
  description: string
  children: React.ReactNode
}

export default function OnboardingStepModal({ 
  step, 
  totalSteps, 
  title, 
  description,
  children 
}: OnboardingStepModalProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isOnboarding) {
      setIsVisible(true)
    } else {
      setIsVisible(false)
    }
  }, [isOnboarding])

  if (!isOnboarding || !isVisible) {
    return <>{children}</>
  }

  const steps = [
    { number: 1, name: 'Settings & Profile', route: '/dashboard/settings' },
    { number: 2, name: 'Integrations', route: '/dashboard/integrations' },
    { number: 3, name: 'Pricing Configuration', route: '/dashboard/pricing-config' },
    { number: 4, name: 'Start First Report', route: '/dashboard/reports/new' }
  ]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md"
        onClick={(e) => {
          // Don't close on backdrop click during onboarding
          e.stopPropagation()
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Animated Background Gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/5 to-cyan-500/10 animate-pulse"></div>
          
          {/* Header */}
          <div className="relative border-b border-cyan-500/20 bg-slate-800/50 backdrop-blur-sm px-8 py-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg border border-cyan-500/30">
                    <Sparkles className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                      {title}
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">Step {step} of {totalSteps}</p>
                  </div>
                </div>
                <p className="text-slate-300 leading-relaxed">{description}</p>
              </div>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="relative px-8 py-6 bg-slate-800/30 border-b border-cyan-500/10">
            <div className="flex items-center justify-between">
              {steps.map((s, index) => {
                const isCompleted = s.number < step
                const isCurrent = s.number === step
                const isUpcoming = s.number > step

                return (
                  <div key={s.number} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      {/* Step Circle */}
                      <div className={`relative w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                        isCompleted
                          ? 'bg-gradient-to-br from-green-500 to-emerald-500 border-green-400 shadow-lg shadow-green-500/30'
                          : isCurrent
                          ? 'bg-gradient-to-br from-cyan-500 to-purple-500 border-cyan-400 shadow-lg shadow-cyan-500/30 animate-pulse'
                          : 'bg-slate-700 border-slate-600'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle className="w-6 h-6 text-white" />
                        ) : (
                          <span className={`text-sm font-bold ${
                            isCurrent ? 'text-white' : 'text-slate-400'
                          }`}>
                            {s.number}
                          </span>
                        )}
                      </div>
                      {/* Step Label */}
                      <div className={`mt-2 text-xs text-center max-w-[100px] ${
                        isCurrent ? 'text-cyan-400 font-semibold' : 
                        isCompleted ? 'text-green-400' : 
                        'text-slate-500'
                      }`}>
                        {s.name}
                      </div>
                    </div>
                    {/* Connector Line */}
                    {index < steps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 transition-all duration-300 ${
                        isCompleted ? 'bg-gradient-to-r from-green-500 to-cyan-500' : 'bg-slate-700'
                      }`}></div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Content - Page content rendered inside modal */}
          <div className="relative max-h-[calc(90vh-280px)] overflow-y-auto bg-slate-900/50">
            <div className="p-6">
              {children}
            </div>
          </div>

          {/* Footer Note */}
          <div className="relative border-t border-cyan-500/10 bg-slate-800/30 px-8 py-4">
            <p className="text-xs text-center text-slate-400">
              💡 Complete this step to automatically proceed to the next one
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

