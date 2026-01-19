"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { X, CheckCircle, Circle, ArrowRight, Sparkles, HelpCircle, Lightbulb, Zap, Building2, KeyRound, DollarSign, FileText, CreditCard } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
// @ts-ignore - canvas-confetti types
import confetti from "canvas-confetti"

interface OnboardingGuideProps {
  step: number
  totalSteps: number
  title: string
  description: string
  value?: string
  children: React.ReactNode
}

export default function OnboardingGuide({ 
  step, 
  totalSteps, 
  title, 
  description,
  value,
  children 
}: OnboardingGuideProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const [isVisible, setIsVisible] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  useEffect(() => {
    if (isOnboarding) {
      // Delay to let page load
      setTimeout(() => setIsVisible(true), 300)
    } else {
      setIsVisible(false)
    }
  }, [isOnboarding])

  useEffect(() => {
    // Check completed steps
    const checkCompleted = async () => {
      try {
        const response = await fetch('/api/onboarding/status')
        if (response.ok) {
          const data = await response.json()
          const completed = Object.entries(data.steps || {})
            .filter(([_, step]: [string, any]) => step.completed)
            .map(([key]) => parseInt(key.split('_')[1] || '0'))
            .filter(n => !isNaN(n))
          setCompletedSteps(completed)
        }
      } catch (error) {
        console.error('Error checking onboarding status:', error)
      }
    }
    if (isOnboarding) {
      checkCompleted()
    }
  }, [isOnboarding, step])

  const steps = [
    { 
      number: 0, 
      name: 'Business Profile', 
      icon: Building2,
      route: '/dashboard/settings',
      description: 'Set up your business details'
    },
    { 
      number: 1, 
      name: 'API Integration', 
      icon: KeyRound,
      route: '/dashboard/integrations',
      description: 'Connect AI for reports'
    },
    { 
      number: 2, 
      name: 'Pricing Setup', 
      icon: DollarSign,
      route: '/dashboard/pricing-config',
      description: 'Configure your rates'
    },
    { 
      number: 3, 
      name: 'First Report', 
      icon: FileText,
      route: '/dashboard/reports/new',
      description: 'Create your first report'
    }
  ]

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    })
  }

  if (!isOnboarding || !isVisible) {
    return <>{children}</>
  }

  const currentStepData = steps.find(s => s.number === step)
  const progress = (step / totalSteps) * 100

  return (
    <div className="relative">
      {/* Main Content - Always Visible */}
      <div className={isVisible && !isMinimized ? 'pr-80' : ''}>
        {children}
      </div>

      {/* Floating Onboarding Guide - Right Sidebar */}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`fixed right-0 top-0 h-full bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 border-l border-cyan-500/20 shadow-2xl z-[150] flex flex-col ${
              isMinimized ? 'w-16' : 'w-80'
            }`}
          >
            {/* Header */}
            <div className="relative border-b border-cyan-500/20 bg-slate-800/80 backdrop-blur-sm p-4">
              {!isMinimized && (
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg border border-cyan-500/30">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                      </div>
                      <h3 className="text-sm font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                        Getting Started
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400">Step {step} of {totalSteps}</p>
                  </div>
                  <button
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              )}
              
              {/* Progress Bar */}
              <div className="relative h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-500 rounded-full"
                />
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Current Step Info */}
                <div className="p-4 border-b border-cyan-500/10 bg-slate-800/30">
                  <div className="flex items-start gap-3 mb-3">
                    {currentStepData && (
                      <div className={`p-2 rounded-lg ${
                        completedSteps.includes(step)
                          ? 'bg-green-500/20 border border-green-500/30'
                          : 'bg-cyan-500/20 border border-cyan-500/30'
                      }`}>
                        <currentStepData.icon className={`w-5 h-5 ${
                          completedSteps.includes(step) ? 'text-green-400' : 'text-cyan-400'
                        }`} />
                      </div>
                    )}
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-white mb-1">{title}</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
                      {value && (
                        <div className="mt-2 p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="w-3.5 h-3.5 text-cyan-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-cyan-300">{value}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Steps List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {steps.map((s) => {
                    const isCompleted = completedSteps.includes(s.number)
                    const isCurrent = s.number === step
                    const isUpcoming = s.number > step

                    return (
                      <motion.div
                        key={s.number}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: s.number * 0.1 }}
                        className={`relative p-3 rounded-lg border transition-all ${
                          isCurrent
                            ? 'bg-cyan-500/10 border-cyan-500/30 shadow-lg shadow-cyan-500/10'
                            : isCompleted
                            ? 'bg-green-500/5 border-green-500/20'
                            : 'bg-slate-800/30 border-slate-700/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                            isCompleted
                              ? 'bg-gradient-to-br from-green-500 to-emerald-500 border-green-400'
                              : isCurrent
                              ? 'bg-gradient-to-br from-cyan-500 to-purple-500 border-cyan-400 animate-pulse'
                              : 'bg-slate-700 border-slate-600'
                          }`}>
                            {isCompleted ? (
                              <CheckCircle className="w-4 h-4 text-white" />
                            ) : (
                              <span className={`text-xs font-bold ${
                                isCurrent ? 'text-white' : 'text-slate-400'
                              }`}>
                                {s.number}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold mb-0.5 ${
                              isCurrent ? 'text-cyan-400' : 
                              isCompleted ? 'text-green-400' : 
                              'text-slate-400'
                            }`}>
                              {s.name}
                            </p>
                            <p className="text-xs text-slate-500">{s.description}</p>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-cyan-500/10 bg-slate-800/30">
                  <div className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-lg">
                    <HelpCircle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <p className="text-xs text-slate-400">
                      Complete this step to continue
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Minimized State - Show expand button */}
            {isMinimized && (
              <div className="flex flex-col items-center justify-center h-full p-2">
                <button
                  onClick={() => setIsMinimized(false)}
                  className="p-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg border border-cyan-500/30 transition-colors"
                  title="Expand guide"
                >
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay for focus (subtle) - Only show when sidebar is expanded */}
      {isVisible && !isMinimized && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/10 backdrop-blur-[1px] z-[140] pointer-events-none"
        />
      )}
    </div>
  )
}

