/**
 * Bottom Action Bar Component
 * Fixed bottom navigation for interview controls
 * Provides back, next, complete, and cancel buttons
 */

'use client'

import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react'

interface BottomActionBarProps {
  onPrevious?: () => void
  onNext?: () => void
  onComplete?: () => void
  onCancel?: () => void
  canGoPrevious?: boolean
  canGoNext?: boolean
  isComplete?: boolean
  disabled?: boolean
}

/**
 * Bottom Action Bar Component
 * Fixed position navigation bar at bottom of screen
 */
export function BottomActionBar({
  onPrevious,
  onNext,
  onComplete,
  onCancel,
  canGoPrevious = false,
  canGoNext = true,
  isComplete = false,
  disabled = false,
}: BottomActionBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-white shadow-lg">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* Left section - Back button */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrevious}
            disabled={!canGoPrevious || disabled}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={disabled}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
        </div>

        {/* Right section - Next/Complete button */}
        <div className="flex gap-2">
          {!isComplete && (
            <Button
              onClick={onNext}
              disabled={!canGoNext || disabled}
              className="gap-2"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}

          {isComplete && onComplete && (
            <Button
              onClick={onComplete}
              disabled={disabled}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <Check className="h-4 w-4" />
              Complete
            </Button>
          )}
        </div>
      </div>

      {/* Safe area for mobile (notch, etc.) */}
      <div className="h-safe-area-inset-bottom" />
    </div>
  )
}
