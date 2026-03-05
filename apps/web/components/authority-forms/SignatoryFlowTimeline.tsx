'use client'

import { CheckCircle, Circle, Clock, User, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Signatory {
  id: string
  signatoryName: string
  signatoryRole: string
  signatoryEmail: string | null
  signatureData: string | null
  signedAt: Date | null
  signatureRequestSent: boolean
  signatureRequestSentAt: Date | null
}

interface SignatoryFlowTimelineProps {
  signatories: Signatory[]
  className?: string
  compact?: boolean
}

/**
 * SignatoryFlowTimeline - Visual timeline showing signatory flow
 *
 * Displays a horizontal (or vertical on mobile) timeline of all signatories
 * with their status: signed (complete), pending (current), or not yet reached.
 *
 * Color scheme:
 * - Green: Signed (completed)
 * - Blue: Pending (needs signature)
 * - Gray: Not yet reached
 */
export function SignatoryFlowTimeline({
  signatories,
  className,
  compact = false
}: SignatoryFlowTimelineProps) {
  if (signatories.length === 0) {
    return null
  }

  const getStepStatus = (signatory: Signatory) => {
    if (signatory.signedAt) return 'completed'
    if (signatory.signatureRequestSent) return 'pending'
    return 'upcoming'
  }

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return CheckCircle
      case 'pending':
        return Clock
      default:
        return Circle
    }
  }

  const getStepColor = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          icon: 'text-emerald-500',
          bg: 'bg-emerald-100 dark:bg-emerald-950/30',
          border: 'border-emerald-300 dark:border-emerald-700',
          text: 'text-emerald-700 dark:text-emerald-400',
          line: 'bg-emerald-500'
        }
      case 'pending':
        return {
          icon: 'text-blue-500',
          bg: 'bg-blue-100 dark:bg-blue-950/30',
          border: 'border-blue-300 dark:border-blue-700',
          text: 'text-blue-700 dark:text-blue-400',
          line: 'bg-slate-300 dark:bg-slate-600'
        }
      default:
        return {
          icon: 'text-slate-400',
          bg: 'bg-slate-100 dark:bg-slate-800',
          border: 'border-slate-300 dark:border-slate-600',
          text: 'text-slate-500 dark:text-slate-400',
          line: 'bg-slate-300 dark:bg-slate-600'
        }
    }
  }

  // Get role badge color
  const getRoleBadgeColor = (role: string) => {
    const roleColors: Record<string, string> = {
      CLIENT: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400',
      INSURER: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
      CONTRACTOR: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400',
      PROPERTY_OWNER: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
      MANAGER: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400',
      TECHNICIAN: 'bg-teal-100 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400',
    }
    return roleColors[role] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Desktop: Horizontal Timeline */}
      <div className="hidden md:block">
        <div className="relative">
          {/* Connection line */}
          <div className="absolute top-7 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-700" />

          {/* Steps */}
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${signatories.length}, minmax(0, 1fr))` }}>
            {signatories.map((signatory, index) => {
              const status = getStepStatus(signatory)
              const Icon = getStepIcon(status)
              const colors = getStepColor(status)
              const isLast = index === signatories.length - 1

              return (
                <div key={signatory.id} className="relative flex flex-col items-center">
                  {/* Colored line segment */}
                  {!isLast && (
                    <div
                      className={cn(
                        'absolute top-7 left-1/2 h-0.5 z-0',
                        colors.line
                      )}
                      style={{ width: 'calc(100% + 1rem)' }}
                    />
                  )}

                  {/* Icon circle */}
                  <div
                    className={cn(
                      'relative z-10 w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all',
                      colors.bg,
                      colors.border,
                      status === 'pending' && 'ring-4 ring-blue-100 dark:ring-blue-950/50 animate-pulse'
                    )}
                  >
                    <Icon className={cn('h-7 w-7', colors.icon)} />
                  </div>

                  {/* Info */}
                  <div className="mt-3 text-center">
                    <p className={cn('text-sm font-semibold truncate max-w-[150px]', colors.text)}>
                      {signatory.signatoryName}
                    </p>
                    <span className={cn(
                      'inline-block text-xs px-2 py-0.5 rounded-full mt-1',
                      getRoleBadgeColor(signatory.signatoryRole)
                    )}>
                      {signatory.signatoryRole}
                    </span>
                    {signatory.signedAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(signatory.signedAt).toLocaleDateString('en-AU', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                    )}
                    {status === 'pending' && signatory.signatureRequestSent && (
                      <div className="flex items-center justify-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400">
                        <Mail className="h-3 w-3" />
                        <span>Request sent</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Mobile: Vertical Timeline */}
      <div className="md:hidden space-y-3">
        {signatories.map((signatory, index) => {
          const status = getStepStatus(signatory)
          const Icon = getStepIcon(status)
          const colors = getStepColor(status)
          const isLast = index === signatories.length - 1

          return (
            <div key={signatory.id} className="relative">
              {/* Vertical line */}
              {!isLast && (
                <div
                  className={cn(
                    'absolute left-5 top-12 w-0.5 h-full',
                    colors.line
                  )}
                />
              )}

              <div className="flex items-start gap-3">
                {/* Icon circle */}
                <div
                  className={cn(
                    'relative z-10 w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                    colors.bg,
                    colors.border,
                    status === 'pending' && 'ring-4 ring-blue-100 dark:ring-blue-950/50'
                  )}
                >
                  <Icon className={cn('h-5 w-5', colors.icon)} />
                </div>

                {/* Info */}
                <div className="flex-1 pt-1">
                  <p className={cn('text-sm font-semibold', colors.text)}>
                    {signatory.signatoryName}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      getRoleBadgeColor(signatory.signatoryRole)
                    )}>
                      {signatory.signatoryRole}
                    </span>
                    {signatory.signedAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(signatory.signedAt).toLocaleDateString('en-AU', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    )}
                  </div>
                  {status === 'pending' && signatory.signatureRequestSent && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400">
                      <Mail className="h-3 w-3" />
                      <span>Request sent</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * SignatoryFlowSummary - Compact summary showing progress
 */
interface SignatoryFlowSummaryProps {
  signatories: Signatory[]
  className?: string
}

export function SignatoryFlowSummary({ signatories, className }: SignatoryFlowSummaryProps) {
  const signedCount = signatories.filter(s => s.signedAt).length
  const totalCount = signatories.length
  const percentage = totalCount > 0 ? (signedCount / totalCount) * 100 : 0
  const isComplete = signedCount === totalCount

  const nextPending = signatories.find(s => !s.signedAt)

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          Signatures: {signedCount} of {totalCount}
        </span>
        {nextPending && !isComplete && (
          <span className="text-xs text-blue-600 dark:text-blue-400">
            Waiting for: {nextPending.signatoryName}
          </span>
        )}
        {isComplete && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5" />
            All signed
          </span>
        )}
      </div>
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isComplete ? 'bg-emerald-500' : 'bg-blue-500'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
