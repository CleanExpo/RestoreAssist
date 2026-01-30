import { cn } from '@/lib/utils'

interface ScoreRingProps {
  score: number // 0-100
  label: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showPercentage?: boolean
  className?: string
}

/**
 * ScoreRing - Circular progress indicator for scores
 *
 * Visual circular progress ring with color-coded score display:
 * - 80-100%: Green (excellent)
 * - 60-79%: Yellow (good)
 * - 40-59%: Orange (fair)
 * - 0-39%: Red (poor)
 */
export function ScoreRing({
  score,
  label,
  size = 'md',
  showPercentage = true,
  className
}: ScoreRingProps) {
  // Clamp score between 0 and 100
  const clampedScore = Math.max(0, Math.min(100, score))

  // Color based on score
  const getScoreColor = (s: number) => {
    if (s >= 80) return { stroke: '#22c55e', bg: 'bg-green-50 dark:bg-green-950/20', text: 'text-green-600 dark:text-green-400' }
    if (s >= 60) return { stroke: '#eab308', bg: 'bg-yellow-50 dark:bg-yellow-950/20', text: 'text-yellow-600 dark:text-yellow-400' }
    if (s >= 40) return { stroke: '#f97316', bg: 'bg-orange-50 dark:bg-orange-950/20', text: 'text-orange-600 dark:text-orange-400' }
    return { stroke: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/20', text: 'text-red-600 dark:text-red-400' }
  }

  const color = getScoreColor(clampedScore)

  // Size variants
  const sizes = {
    sm: {
      dimension: 80,
      strokeWidth: 6,
      fontSize: 'text-lg',
      labelSize: 'text-xs',
      radius: 34
    },
    md: {
      dimension: 120,
      strokeWidth: 8,
      fontSize: 'text-2xl',
      labelSize: 'text-sm',
      radius: 50
    },
    lg: {
      dimension: 160,
      strokeWidth: 10,
      fontSize: 'text-3xl',
      labelSize: 'text-base',
      radius: 70
    },
    xl: {
      dimension: 200,
      strokeWidth: 12,
      fontSize: 'text-4xl',
      labelSize: 'text-lg',
      radius: 90
    }
  }

  const config = sizes[size]
  const center = config.dimension / 2
  const circumference = 2 * Math.PI * config.radius
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className={cn('relative', color.bg, 'rounded-full p-2')}>
        <svg
          width={config.dimension}
          height={config.dimension}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={config.radius}
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            fill="none"
            className="text-slate-200 dark:text-slate-700"
          />
          {/* Progress circle */}
          <circle
            cx={center}
            cy={center}
            r={config.radius}
            stroke={color.stroke}
            strokeWidth={config.strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-bold', config.fontSize, color.text)}>
            {showPercentage ? `${Math.round(clampedScore)}%` : Math.round(clampedScore)}
          </span>
        </div>
      </div>
      {/* Label */}
      <span className={cn('font-medium text-center text-slate-700 dark:text-slate-300', config.labelSize)}>
        {label}
      </span>
    </div>
  )
}

/**
 * ScoreRingGroup - Display multiple score rings in a row
 */
interface ScoreRingGroupProps {
  scores: Array<{
    value: number
    label: string
  }>
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function ScoreRingGroup({ scores, size = 'md', className }: ScoreRingGroupProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-6', className)}>
      {scores.map((score, idx) => (
        <ScoreRing
          key={idx}
          score={score.value}
          label={score.label}
          size={size}
        />
      ))}
    </div>
  )
}
