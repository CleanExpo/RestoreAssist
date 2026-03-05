/**
 * Progress Ring Component
 * Circular progress indicator showing interview progress by tier
 * Allows jumping back to previous tiers/questions
 */

'use client'

import { useCallback } from 'react'
import { Lock } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Question } from '@/lib/interview'

interface ProgressRingProps {
  current: number
  total: number
  tier: number
  onQuestionSelect?: (questionId: string) => void
  allQuestions?: Question[]
  userTierLevel?: 'STANDARD' | 'PREMIUM' | 'ENTERPRISE'
  onUpgrade?: () => void
}

/**
 * Progress Ring Component
 * Displays circular progress with tier segments
 */
export function ProgressRing({
  current,
  total,
  tier,
  onQuestionSelect,
  allQuestions = [],
  userTierLevel = 'STANDARD',
  onUpgrade,
}: ProgressRingProps) {
  // Determine max unlocked tier based on subscription
  const maxUnlockedTier = userTierLevel === 'ENTERPRISE' ? 4 : userTierLevel === 'PREMIUM' ? 3 : 2

  const percentage = total > 0 ? (current / total) * 100 : 0

  /**
   * Get tier boundaries
   */
  const getTierBoundaries = (tierNum: number): [number, number] => {
    switch (tierNum) {
      case 1:
        return [0, 5] // Tier 1: questions 1-5
      case 2:
        return [5, 8] // Tier 2: questions 6-8
      case 3:
        return [8, 13] // Tier 3: questions 9-13
      case 4:
        return [13, 999] // Tier 4: questions 14+
      default:
        return [0, 999]
    }
  }

  /**
   * Get tier color
   */
  const getTierColor = (tierNum: number): string => {
    switch (tierNum) {
      case 1:
        return 'from-blue-500 to-blue-600'
      case 2:
        return 'from-green-500 to-green-600'
      case 3:
        return 'from-amber-500 to-amber-600'
      case 4:
        return 'from-purple-500 to-purple-600'
      default:
        return 'from-gray-500 to-gray-600'
    }
  }

  /**
   * Get tier label
   */
  const getTierLabel = (tierNum: number): string => {
    switch (tierNum) {
      case 1:
        return 'Essential'
      case 2:
        return 'Environmental'
      case 3:
        return 'Compliance'
      case 4:
        return 'Specialized'
      default:
        return 'Interview'
    }
  }

  /**
   * Handle tier click
   */
  const handleTierClick = useCallback(
    (tierNum: number) => {
      if (!onQuestionSelect || allQuestions.length === 0) return

      // Find first question in tier
      const [minSeq, maxSeq] = getTierBoundaries(tierNum)
      const tierQuestion = allQuestions.find(
        (q) =>
          q.sequenceNumber &&
          q.sequenceNumber >= minSeq &&
          q.sequenceNumber <= maxSeq &&
          (current === 0 || // Always allow first tier
            allQuestions.findIndex((aq) => aq.id === q.id) <=
              allQuestions.findIndex((aq) => aq.id === allQuestions[current - 1]?.id || '')) // Or if in past
      )

      if (tierQuestion) {
        onQuestionSelect(tierQuestion.id)
      }
    },
    [onQuestionSelect, allQuestions, current]
  )

  /**
   * Calculate SVG path for circular progress
   */
  const calculateCirclePath = (): string => {
    const radius = 40
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (percentage / 100) * circumference

    return `
      <svg class="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
        <!-- Background circle -->
        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="3" class="text-gray-200" />

        <!-- Progress circle -->
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="url(#progress-gradient)"
          stroke-width="3"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${strokeDashoffset}"
          stroke-linecap="round"
          class="transition-all duration-500"
        />

        <!-- Gradient definition -->
        <defs>
          <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#2563eb;stop-opacity:1" />
          </linearGradient>
        </defs>
      </svg>
    `
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col items-center gap-3">
        {/* Circular progress ring */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative w-24 h-24 flex items-center justify-center">
              {/* SVG Circle */}
              <svg className="w-24 h-24 transform -rotate-90 absolute" viewBox="0 0 100 100">
                {/* Background circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-gray-200"
                />

                {/* Progress circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="url(#progress-gradient)"
                  strokeWidth="2"
                  strokeDasharray={`${(percentage / 100) * 251.2} 251.2`}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />

                {/* Gradient definition */}
                <defs>
                  <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#1e40af" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Center content */}
              <div className="text-center">
                <div className="text-2xl font-bold">{Math.round(percentage)}%</div>
                <div className="text-xs text-muted-foreground">{current} / {total}</div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p className="font-semibold">{percentage.toFixed(0)}% Complete</p>
              <p className="text-xs text-muted-foreground">
                {current} of {total} questions answered
              </p>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Tier indicators */}
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((tierNum) => {
            const [minSeq, maxSeq] = getTierBoundaries(tierNum)
            const tierQuestions = allQuestions.filter(
              (q) => q.sequenceNumber && q.sequenceNumber >= minSeq && q.sequenceNumber <= maxSeq
            )
            const isLocked = tierNum > maxUnlockedTier

            return (
              <Tooltip key={tierNum}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => isLocked && onUpgrade ? onUpgrade() : handleTierClick(tierNum)}
                    disabled={!onQuestionSelect && !isLocked}
                    className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold
                      transition-all duration-200 cursor-pointer
                      ${isLocked
                        ? 'bg-amber-100 text-amber-500 border border-amber-300 cursor-pointer hover:bg-amber-200'
                        : tierNum === tier
                          ? `bg-gradient-to-r ${getTierColor(tierNum)} text-white shadow-lg scale-110`
                          : tierNum < tier
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-400 cursor-default'
                      }
                      ${onQuestionSelect && !isLocked ? 'hover:shadow-md' : ''}
                    `}
                  >
                    {isLocked ? <Lock size={12} /> : tierNum}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    <p className="font-semibold">Tier {tierNum}: {getTierLabel(tierNum)}</p>
                    {isLocked ? (
                      <p className="text-xs text-amber-600">
                        Upgrade to {tierNum <= 3 ? 'Premium' : 'Enterprise'} to unlock
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {tierQuestions.length} questions
                        {tierNum < tier && ` (Completed)`}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        {/* Current tier label */}
        <div className="text-center text-xs">
          <p className="font-semibold text-gray-700">Tier {tier}</p>
          <p className="text-muted-foreground">{getTierLabel(tier)}</p>
        </div>
      </div>
    </TooltipProvider>
  )
}
