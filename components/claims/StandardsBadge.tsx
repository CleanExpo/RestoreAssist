import { Badge } from '@/components/ui/badge'
import { FileText, BookOpen, Shield, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StandardsBadgeProps {
  standardRef: string
  className?: string
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
}

/**
 * StandardsBadge - Visual badge for IICRC, NCC, and Australian Standards references
 *
 * Parses standard references and displays with appropriate icon and styling:
 * - IICRC S500, S520, etc. → Blue badge with book icon
 * - NCC 2025, NCC 2022, etc. → Purple badge with shield icon
 * - AS/NZS standards → Green badge with scale icon
 * - Generic references → Gray badge with file icon
 */
export function StandardsBadge({
  standardRef,
  className,
  showIcon = true,
  size = 'md'
}: StandardsBadgeProps) {
  // Parse standard reference to determine type and styling
  const getStandardType = (ref: string) => {
    const upper = ref.toUpperCase()

    if (upper.includes('IICRC')) {
      return {
        type: 'IICRC',
        icon: BookOpen,
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300 dark:border-blue-700',
        label: ref.match(/IICRC\s+(S\d+)/i)?.[0] || ref,
      }
    }

    if (upper.includes('NCC')) {
      return {
        type: 'NCC',
        icon: Shield,
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-300 dark:border-purple-700',
        label: ref.match(/NCC\s+\d{4}/i)?.[0] || ref,
      }
    }

    if (upper.includes('AS/NZS') || upper.includes('AS ') || upper.includes('NZS ')) {
      return {
        type: 'AS_NZS',
        icon: Scale,
        color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700',
        label: ref.match(/AS\/NZS\s+[\d.:]+/i)?.[0] || ref.match(/AS\s+\d+/i)?.[0] || ref,
      }
    }

    if (upper.includes('WHS') || upper.includes('OH&S') || upper.includes('OHS')) {
      return {
        type: 'OHS',
        icon: Shield,
        color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700',
        label: ref,
      }
    }

    // Generic/unknown standard
    return {
      type: 'GENERIC',
      icon: FileText,
      color: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400 border-slate-300 dark:border-slate-700',
      label: ref,
    }
  }

  const standard = getStandardType(standardRef)
  const Icon = standard.icon

  // Size variants
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  }

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold border transition-all hover:scale-105',
        standard.color,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      <span>{standard.label}</span>
    </Badge>
  )
}

/**
 * StandardsGroup - Groups multiple standards badges together
 */
interface StandardsGroupProps {
  standards: string[]
  maxVisible?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function StandardsGroup({
  standards,
  maxVisible = 3,
  size = 'md',
  className
}: StandardsGroupProps) {
  const visible = standards.slice(0, maxVisible)
  const remaining = standards.length - maxVisible

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {visible.map((ref, idx) => (
        <StandardsBadge
          key={idx}
          standardRef={ref}
          size={size}
        />
      ))}
      {remaining > 0 && (
        <Badge
          variant="outline"
          className={cn(
            'bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400 border-slate-300 dark:border-slate-700',
            size === 'sm' ? 'text-xs px-2 py-0.5' : size === 'lg' ? 'text-base px-3 py-1.5' : 'text-sm px-2.5 py-1'
          )}
        >
          +{remaining} more
        </Badge>
      )}
    </div>
  )
}
