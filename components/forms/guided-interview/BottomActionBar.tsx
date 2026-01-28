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
    <div className="fixed bottom-0 left-0 right-0 border-t-2 border-border/70 bg-background/95 backdrop-blur-md shadow-2xl z-40">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        {/* Left section - Back button */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={onPrevious}
            disabled={!canGoPrevious || disabled}
            className="gap-2 border-2 hover:bg-accent transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="font-medium">Back</span>
          </Button>

          {onCancel && (
            <Button
              variant="ghost"
              size="lg"
              onClick={onCancel}
              disabled={disabled}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
            >
              <X className="h-5 w-5 mr-1" />
              <span className="font-medium">Cancel</span>
            </Button>
          )}
        </div>

        {/* Right section - Next/Complete button */}
        <div className="flex gap-3">
          {!isComplete && (
            <Button
              onClick={onNext}
              disabled={!canGoNext || disabled}
              className="gap-2 h-11 px-6 text-base font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <span>Next</span>
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}

          {isComplete && onComplete && (
            <Button
              onClick={onComplete}
              disabled={disabled}
              className="gap-2 h-11 px-6 text-base font-semibold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <Check className="h-5 w-5" />
              <span>Complete Interview</span>
            </Button>
          )}
        </div>
      </div>

      {/* Safe area for mobile (notch, etc.) */}
      <div className="h-safe-area-inset-bottom bg-background/95" />
    </div>
  )
}
