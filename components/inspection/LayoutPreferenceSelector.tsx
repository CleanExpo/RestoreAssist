'use client'

import { LayoutGrid, Clock, Zap, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InspectionLayout } from '@/types/room'
import type { LucideIcon } from 'lucide-react'

interface LayoutOption {
  id: InspectionLayout
  title: string
  description: string
  icon: LucideIcon
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: 'ROOM_FIRST',
    title: 'Room-First',
    description:
      'Organise documentation room by room. Best for thorough inspections with structured scope.',
    icon: LayoutGrid,
  },
  {
    id: 'TIMELINE',
    title: 'Timeline',
    description:
      'Chronological feed of all photos and readings across rooms. Great for progress tracking.',
    icon: Clock,
  },
  {
    id: 'QUICK_CAPTURE',
    title: 'Quick Capture',
    description:
      'Rapid photo and reading capture with auto-tagging. Fastest for initial site visits.',
    icon: Zap,
  },
]

interface LayoutPreferenceSelectorProps {
  value: InspectionLayout
  onChange: (layout: InspectionLayout) => void
}

export default function LayoutPreferenceSelector({
  value,
  onChange,
}: LayoutPreferenceSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {LAYOUT_OPTIONS.map((option) => {
        const Icon = option.icon
        const isActive = value === option.id

        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              'relative flex flex-col items-start gap-3 p-4 rounded-2xl text-left transition-all duration-200',
              'bg-slate-800/50 backdrop-blur-sm border',
              isActive
                ? 'border-cyan-500/30 bg-cyan-500/10 ring-1 ring-cyan-500/20'
                : 'border-slate-700/50 hover:bg-slate-700/30 hover:border-slate-600'
            )}
          >
            {/* Active indicator */}
            {isActive && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}

            {/* Icon */}
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                isActive
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'bg-slate-700/50 text-slate-400'
              )}
            >
              <Icon className="w-5 h-5" />
            </div>

            {/* Content */}
            <div>
              <p
                className={cn(
                  'text-sm font-semibold mb-1',
                  isActive ? 'text-cyan-400' : 'text-white'
                )}
              >
                {option.title}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                {option.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
