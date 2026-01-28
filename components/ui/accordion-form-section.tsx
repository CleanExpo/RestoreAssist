'use client'

import React from 'react'
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export interface AccordionFormSectionProps {
  title: string
  description?: string
  completionPercentage: number
  hasErrors: boolean
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
  aiSuggestions?: number // Badge count for AI suggestions available
  sectionNumber: number
  totalSections: number
}

export function AccordionFormSection({
  title,
  description,
  completionPercentage,
  hasErrors,
  isExpanded,
  onToggle,
  children,
  aiSuggestions = 0,
  sectionNumber,
  totalSections
}: AccordionFormSectionProps) {
  // Determine status color based on completion and errors
  const statusColor = hasErrors
    ? 'red'
    : completionPercentage === 100
    ? 'green'
    : completionPercentage > 0
    ? 'orange'
    : 'gray'

  // Status icon based on state
  const StatusIcon = hasErrors
    ? AlertCircle
    : completionPercentage === 100
    ? CheckCircle2
    : Circle

  // Accessibility attributes
  const headingId = `accordion-header-${sectionNumber}`
  const contentId = `accordion-content-${sectionNumber}`

  return (
    <div
      className={cn(
        'border rounded-lg mb-2 transition-all',
        isExpanded && 'ring-2 ring-primary/20',
        hasErrors && 'border-red-300 bg-red-50/30',
        completionPercentage === 100 && !hasErrors && 'border-green-300 bg-green-50/20'
      )}
      role="region"
      aria-labelledby={headingId}
    >
      {/* Accordion Header */}
      <button
        id={headingId}
        onClick={onToggle}
        type="button"
        className={cn(
          'w-full flex items-center justify-between p-4 text-left',
          'hover:bg-gray-50 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-inset',
          isExpanded && 'bg-gray-50'
        )}
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        {/* Left side: Status icon, title, and metadata */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Status Icon */}
          <StatusIcon
            className={cn(
              'h-5 w-5 mt-0.5 flex-shrink-0',
              statusColor === 'red' && 'text-red-500',
              statusColor === 'green' && 'text-green-500',
              statusColor === 'orange' && 'text-orange-500',
              statusColor === 'gray' && 'text-gray-300'
            )}
            aria-hidden="true"
          />

          {/* Title and description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-gray-900">
                {sectionNumber}. {title}
              </h3>

              {/* AI Suggestions Badge */}
              {aiSuggestions > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {aiSuggestions} AI suggestion{aiSuggestions > 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            {/* Description (only show when collapsed) */}
            {!isExpanded && description && (
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{description}</p>
            )}

            {/* Completion status text (only show when collapsed) */}
            {!isExpanded && (
              <p className="text-xs text-gray-400 mt-1">
                {hasErrors && 'Contains errors • '}
                {completionPercentage}% complete
              </p>
            )}
          </div>
        </div>

        {/* Right side: Progress indicator and chevron */}
        <div className="flex items-center gap-3 ml-4">
          {/* Progress Ring */}
          <ProgressRing
            percentage={completionPercentage}
            size={40}
            strokeWidth={3}
            hasErrors={hasErrors}
          />

          {/* Chevron */}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-500 flex-shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* Accordion Content */}
      {isExpanded && (
        <div
          id={contentId}
          className="p-6 border-t bg-white"
          role="region"
          aria-labelledby={headingId}
        >
          {/* Description (show when expanded) */}
          {description && <p className="text-sm text-gray-600 mb-4">{description}</p>}

          {/* Section content */}
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Progress Ring Component
 * Displays a circular progress indicator
 */
interface ProgressRingProps {
  percentage: number
  size?: number
  strokeWidth?: number
  hasErrors?: boolean
}

function ProgressRing({ percentage, size = 40, strokeWidth = 3, hasErrors = false }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  // Determine color based on state
  const strokeColor = hasErrors
    ? 'stroke-red-500'
    : percentage === 100
    ? 'stroke-green-500'
    : percentage > 0
    ? 'stroke-orange-500'
    : 'stroke-gray-200'

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {/* Background circle */}
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(strokeColor, 'transition-all duration-300')}
          strokeLinecap="round"
        />
      </svg>

      {/* Percentage text in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-medium text-gray-600">{Math.round(percentage)}%</span>
      </div>
    </div>
  )
}

/**
 * Accordion Form Container
 * Wrapper component for managing multiple accordion sections
 */
interface AccordionFormContainerProps {
  children: React.ReactNode
  className?: string
}

export function AccordionFormContainer({ children, className }: AccordionFormContainerProps) {
  return (
    <div className={cn('space-y-2', className)} role="tablist" aria-orientation="vertical">
      {children}
    </div>
  )
}
