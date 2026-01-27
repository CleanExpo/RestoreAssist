'use client'

import { HelpCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface HelpTooltipProps {
  content: string
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * Simple inline help tooltip for form fields and UI elements
 * Shows a brief description on hover
 */
export function HelpTooltip({ content, className, side = 'top' }: HelpTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center justify-center rounded-full p-0.5 text-neutral-400 hover:text-cyan-500 transition-colors',
              className
            )}
            aria-label="Help"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-xs text-sm bg-neutral-900 text-white border-neutral-800"
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
