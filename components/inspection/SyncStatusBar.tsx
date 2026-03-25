'use client'

import { CheckCircle2, CloudOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SyncStatusBarProps {
  status: 'synced' | 'pending' | 'offline'
  pendingCount?: number
}

const STATUS_CONFIG = {
  synced: {
    icon: CheckCircle2,
    label: 'All changes saved',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/20',
    textClass: 'text-emerald-400',
    dotClass: 'bg-emerald-400',
  },
  pending: {
    icon: Loader2,
    label: 'Syncing',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/20',
    textClass: 'text-amber-400',
    dotClass: 'bg-amber-400',
  },
  offline: {
    icon: CloudOff,
    label: 'Offline — changes saved locally',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/20',
    textClass: 'text-red-400',
    dotClass: 'bg-red-400',
  },
} as const

export default function SyncStatusBar({
  status,
  pendingCount,
}: SyncStatusBarProps) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium border-b transition-all duration-300',
        config.bgClass,
        config.borderClass,
        config.textClass
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn(
          'w-3.5 h-3.5 flex-shrink-0',
          status === 'pending' && 'animate-spin'
        )}
      />
      <span>
        {config.label}
        {status === 'pending' && pendingCount != null && pendingCount > 0 && (
          <span className="ml-1 opacity-80">
            ({pendingCount} {pendingCount === 1 ? 'change' : 'changes'})
          </span>
        )}
      </span>
    </div>
  )
}
