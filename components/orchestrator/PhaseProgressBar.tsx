"use client"

import { motion } from "framer-motion"
import { Check, Clock, Loader2 } from "lucide-react"

/**
 * Phase state type definition
 */
export type PhaseState = 'complete' | 'active' | 'upcoming'

/**
 * Orchestrator phase type
 */
export type OrchestratorPhase = 'initiation' | 'processing' | 'qa' | 'output'

/**
 * Phase configuration interface
 */
interface PhaseConfig {
  id: OrchestratorPhase
  label: string
  description: string
  color: {
    DEFAULT: string
    light: string
    dark: string
  }
}

/**
 * Progress data interface
 */
export interface PhaseProgress {
  currentPhase: OrchestratorPhase
  completedPhases: OrchestratorPhase[]
  progressPercentage: number
  estimatedTimeRemaining?: string
}

interface PhaseProgressBarProps {
  progress: PhaseProgress
  className?: string
  showDetails?: boolean
}

/**
 * PhaseProgressBar Component
 *
 * Displays a horizontal stepper showing the 4 phases of the orchestrator workflow.
 * Each phase has distinct colors and states (complete, active, upcoming).
 * Includes progress percentage and estimated time remaining.
 *
 * @component
 * @example
 * ```tsx
 * <PhaseProgressBar
 *   progress={{
 *     currentPhase: 'processing',
 *     completedPhases: ['initiation'],
 *     progressPercentage: 45,
 *     estimatedTimeRemaining: '5 min'
 *   }}
 * />
 * ```
 */
export default function PhaseProgressBar({
  progress,
  className = "",
  showDetails = true
}: PhaseProgressBarProps) {
  const phases: PhaseConfig[] = [
    {
      id: 'initiation',
      label: 'Initiation',
      description: 'Input collection & validation',
      color: {
        DEFAULT: '#2563EB',
        light: '#DBEAFE',
        dark: '#1E3A8A'
      }
    },
    {
      id: 'processing',
      label: 'Processing',
      description: 'AI analysis & report generation',
      color: {
        DEFAULT: '#9333EA',
        light: '#F3E8FF',
        dark: '#581C87'
      }
    },
    {
      id: 'qa',
      label: 'Q&A',
      description: 'Quality assurance & review',
      color: {
        DEFAULT: '#06B6D4',
        light: '#CFFAFE',
        dark: '#164E63'
      }
    },
    {
      id: 'output',
      label: 'Output',
      description: 'Final report delivery',
      color: {
        DEFAULT: '#10B981',
        light: '#D1FAE5',
        dark: '#064E3B'
      }
    }
  ]

  const getPhaseState = (phaseId: OrchestratorPhase): PhaseState => {
    if (progress.completedPhases.includes(phaseId)) {
      return 'complete'
    }
    if (progress.currentPhase === phaseId) {
      return 'active'
    }
    return 'upcoming'
  }

  const getPhaseIndex = (phaseId: OrchestratorPhase): number => {
    return phases.findIndex(p => p.id === phaseId)
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Header with Progress Stats */}
      {showDetails && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
              Workflow Progress
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {phases.find(p => p.id === progress.currentPhase)?.description}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {progress.progressPercentage}%
            </div>
            {progress.estimatedTimeRemaining && (
              <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 mt-1">
                <Clock className="w-3 h-3" />
                <span>{progress.estimatedTimeRemaining} remaining</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress Bar Background */}
      <div className="relative mb-8">
        <div className="absolute top-[30px] left-0 right-0 h-1 bg-slate-200 dark:bg-slate-700/50 rounded-full">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress.progressPercentage}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 rounded-full"
          />
        </div>

        {/* Phase Steps */}
        <div className="relative flex justify-between">
          {phases.map((phase, index) => {
            const state = getPhaseState(phase.id)
            const isComplete = state === 'complete'
            const isActive = state === 'active'
            const isUpcoming = state === 'upcoming'

            return (
              <div
                key={phase.id}
                className="flex flex-col items-center"
                style={{ width: '25%' }}
              >
                {/* Phase Circle */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1, duration: 0.3 }}
                  className="relative z-10"
                >
                  {/* Outer Ring */}
                  <motion.div
                    animate={{
                      scale: isActive ? [1, 1.2, 1] : 1,
                      opacity: isActive ? [0.5, 1, 0.5] : 1
                    }}
                    transition={{
                      duration: 2,
                      repeat: isActive ? Infinity : 0,
                      ease: "easeInOut"
                    }}
                    className={`
                      w-[60px] h-[60px] rounded-full flex items-center justify-center
                      ${isComplete
                        ? `bg-gradient-to-br from-[${phase.color.DEFAULT}] to-[${phase.color.dark}]`
                        : isActive
                        ? `bg-white dark:bg-slate-800 border-4`
                        : 'bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600'
                      }
                    `}
                    style={{
                      borderColor: isActive ? phase.color.DEFAULT : undefined,
                      background: isComplete
                        ? `linear-gradient(135deg, ${phase.color.DEFAULT} 0%, ${phase.color.dark} 100%)`
                        : undefined
                    }}
                  >
                    {/* Icon */}
                    {isComplete ? (
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.2, type: "spring" }}
                      >
                        <Check className="w-7 h-7 text-white" strokeWidth={3} />
                      </motion.div>
                    ) : isActive ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        <Loader2
                          className="w-7 h-7"
                          style={{ color: phase.color.DEFAULT }}
                        />
                      </motion.div>
                    ) : (
                      <div
                        className="w-4 h-4 rounded-full bg-slate-400 dark:bg-slate-600"
                      />
                    )}
                  </motion.div>

                  {/* Pulsing Effect for Active Phase */}
                  {isActive && (
                    <motion.div
                      animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.5, 0, 0.5]
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: phase.color.light }}
                    />
                  )}
                </motion.div>

                {/* Phase Label */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className="mt-3 text-center"
                >
                  <div
                    className={`
                      text-sm font-semibold mb-1
                      ${isActive
                        ? 'text-slate-900 dark:text-white'
                        : isComplete
                        ? 'text-slate-700 dark:text-slate-300'
                        : 'text-slate-500 dark:text-slate-500'
                      }
                    `}
                    style={{
                      color: isActive ? phase.color.DEFAULT : undefined
                    }}
                  >
                    {phase.label}
                  </div>
                  <div className="hidden md:block text-xs text-slate-500 dark:text-slate-500 max-w-[100px]">
                    {isActive ? 'In Progress' : isComplete ? 'Complete' : 'Pending'}
                  </div>
                </motion.div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Mobile-Friendly Phase Details */}
      <div className="md:hidden mt-6">
        <div className="grid grid-cols-2 gap-3">
          {phases.map((phase) => {
            const state = getPhaseState(phase.id)
            const isActive = state === 'active'

            return (
              <div
                key={phase.id}
                className={`
                  p-3 rounded-lg border
                  ${isActive
                    ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-500/10'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  {state === 'complete' && (
                    <Check className="w-4 h-4 text-emerald-500" />
                  )}
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  )}
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    {phase.label}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {state === 'active' ? 'In Progress' : state === 'complete' ? 'Complete' : 'Pending'}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
