import { cn } from '@/lib/utils'
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react'

interface SeverityDistributionChartProps {
  critical: number
  high: number
  medium: number
  low: number
  size?: 'sm' | 'md' | 'lg'
  showLegend?: boolean
  className?: string
}

/**
 * SeverityDistributionChart - Donut chart showing severity distribution
 *
 * Visual donut chart with color-coded segments:
 * - CRITICAL: Red
 * - HIGH: Orange
 * - MEDIUM: Yellow
 * - LOW: Blue
 */
export function SeverityDistributionChart({
  critical,
  high,
  medium,
  low,
  size = 'md',
  showLegend = true,
  className
}: SeverityDistributionChartProps) {
  const total = critical + high + medium + low

  if (total === 0) {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <p className="text-sm text-muted-foreground">No issues to display</p>
      </div>
    )
  }

  // Calculate percentages
  const percentages = {
    critical: (critical / total) * 100,
    high: (high / total) * 100,
    medium: (medium / total) * 100,
    low: (low / total) * 100
  }

  // Size variants
  const sizes = {
    sm: { dimension: 120, strokeWidth: 20, centerSize: 'text-lg', labelSize: 'text-xs' },
    md: { dimension: 180, strokeWidth: 30, centerSize: 'text-2xl', labelSize: 'text-sm' },
    lg: { dimension: 240, strokeWidth: 40, centerSize: 'text-3xl', labelSize: 'text-base' }
  }

  const config = sizes[size]
  const radius = (config.dimension - config.strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = config.dimension / 2

  // Calculate stroke dash arrays for each segment
  // Starting from top (12 o'clock) and going clockwise
  let currentOffset = circumference * 0.25 // Start at top

  const segments = [
    {
      label: 'CRITICAL',
      value: critical,
      percentage: percentages.critical,
      color: '#ef4444',
      icon: AlertTriangle,
      offset: currentOffset
    },
    {
      label: 'HIGH',
      value: high,
      percentage: percentages.high,
      color: '#f97316',
      icon: AlertCircle,
      offset: (currentOffset -= (percentages.critical / 100) * circumference)
    },
    {
      label: 'MEDIUM',
      value: medium,
      percentage: percentages.medium,
      color: '#eab308',
      icon: Info,
      offset: (currentOffset -= (percentages.high / 100) * circumference)
    },
    {
      label: 'LOW',
      value: low,
      percentage: percentages.low,
      color: '#3b82f6',
      icon: CheckCircle2,
      offset: (currentOffset -= (percentages.medium / 100) * circumference)
    }
  ]

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* Donut Chart */}
      <div className="relative">
        <svg width={config.dimension} height={config.dimension} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            className="text-slate-100 dark:text-slate-800"
          />

          {/* Severity segments */}
          {segments.map((segment, idx) => {
            if (segment.value === 0) return null

            const segmentLength = (segment.percentage / 100) * circumference

            return (
              <circle
                key={idx}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={config.strokeWidth}
                strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                strokeDashoffset={-segment.offset}
                strokeLinecap="butt"
                className="transition-all duration-500"
              />
            )
          })}
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-bold text-slate-900 dark:text-slate-100', config.centerSize)}>
            {total}
          </span>
          <span className="text-xs text-muted-foreground">Total Issues</span>
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
          {segments.map((segment, idx) => {
            if (segment.value === 0) return null

            const Icon = segment.icon

            return (
              <div key={idx} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: segment.color }}
                />
                <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium truncate', config.labelSize)}>
                    {segment.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {segment.value} ({segment.percentage.toFixed(0)}%)
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * SeveritySummaryBar - Horizontal bar showing severity distribution
 */
interface SeveritySummaryBarProps {
  critical: number
  high: number
  medium: number
  low: number
  className?: string
}

export function SeveritySummaryBar({
  critical,
  high,
  medium,
  low,
  className
}: SeveritySummaryBarProps) {
  const total = critical + high + medium + low

  if (total === 0) return null

  const percentages = {
    critical: (critical / total) * 100,
    high: (high / total) * 100,
    medium: (medium / total) * 100,
    low: (low / total) * 100
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          Severity Distribution
        </span>
        <span className="text-muted-foreground">{total} total</span>
      </div>
      <div className="h-6 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
        {critical > 0 && (
          <div
            className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${percentages.critical}%` }}
            title={`${critical} CRITICAL (${percentages.critical.toFixed(0)}%)`}
          >
            {percentages.critical >= 10 && critical}
          </div>
        )}
        {high > 0 && (
          <div
            className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${percentages.high}%` }}
            title={`${high} HIGH (${percentages.high.toFixed(0)}%)`}
          >
            {percentages.high >= 10 && high}
          </div>
        )}
        {medium > 0 && (
          <div
            className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${percentages.medium}%` }}
            title={`${medium} MEDIUM (${percentages.medium.toFixed(0)}%)`}
          >
            {percentages.medium >= 10 && medium}
          </div>
        )}
        {low > 0 && (
          <div
            className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${percentages.low}%` }}
            title={`${low} LOW (${percentages.low.toFixed(0)}%)`}
          >
            {percentages.low >= 10 && low}
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 bg-red-500 rounded-full" />
          <span className="text-muted-foreground">{critical} Critical</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 bg-orange-500 rounded-full" />
          <span className="text-muted-foreground">{high} High</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 bg-yellow-500 rounded-full" />
          <span className="text-muted-foreground">{medium} Medium</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 bg-blue-500 rounded-full" />
          <span className="text-muted-foreground">{low} Low</span>
        </div>
      </div>
    </div>
  )
}
