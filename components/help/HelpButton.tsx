'use client'

import { useState } from 'react'
import { HelpCircle, X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface HelpButtonProps {
  title: string
  description: string
  steps?: string[]
  tips?: string[]
  learnMoreUrl?: string
  className?: string
  variant?: 'icon' | 'button' | 'inline'
}

/**
 * Context-sensitive help button component
 * Provides inline help for specific features with optional steps and tips
 */
export function HelpButton({
  title,
  description,
  steps,
  tips,
  learnMoreUrl,
  className,
  variant = 'icon',
}: HelpButtonProps) {
  const [open, setOpen] = useState(false)

  const trigger =
    variant === 'icon' ? (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center justify-center rounded-full p-1 text-neutral-500 hover:text-cyan-500 hover:bg-cyan-500/10 transition-colors',
          className
        )}
        aria-label={`Help: ${title}`}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
    ) : variant === 'button' ? (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn('gap-2', className)}
      >
        <HelpCircle className="h-4 w-4" />
        Help
      </Button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1 text-sm text-cyan-500 hover:text-cyan-400 hover:underline',
          className
        )}
      >
        <HelpCircle className="h-3 w-3" />
        Learn more
      </button>
    )

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-neutral-900 dark:text-white">
              <HelpCircle className="h-5 w-5 text-cyan-500" />
              {title}
            </DialogTitle>
            <DialogDescription className="text-neutral-600 dark:text-neutral-400">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {steps && steps.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-neutral-900 dark:text-white mb-2">
                  How to use:
                </h4>
                <ol className="space-y-2">
                  {steps.map((step, index) => (
                    <li
                      key={index}
                      className="flex gap-3 text-sm text-neutral-600 dark:text-neutral-400"
                    >
                      <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-500 text-xs font-medium">
                        {index + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {tips && tips.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-neutral-900 dark:text-white mb-2">
                  Tips:
                </h4>
                <ul className="space-y-1">
                  {tips.map((tip, index) => (
                    <li
                      key={index}
                      className="flex gap-2 text-sm text-neutral-600 dark:text-neutral-400"
                    >
                      <span className="text-amber-500">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {learnMoreUrl && (
              <a
                href={learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-cyan-500 hover:text-cyan-400"
              >
                View full documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
