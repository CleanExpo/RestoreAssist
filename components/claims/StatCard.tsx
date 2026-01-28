import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * StatCard - Enhanced statistics card with icon, trend, and color variants
 *
 * Displays key metrics in a visually appealing card format with:
 * - Optional icon
 * - Large value display
 * - Subtitle/description
 * - Optional trend indicator
 * - Color variants (success, warning, danger, info)
 */
export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  size = 'md',
  className
}: StatCardProps) {
  // Variant styles
  const variants = {
    default: {
      card: 'border-slate-200 dark:border-slate-700',
      icon: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
      value: 'text-slate-900 dark:text-slate-100',
      title: 'text-slate-600 dark:text-slate-400'
    },
    success: {
      card: 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20',
      icon: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
      value: 'text-green-700 dark:text-green-400',
      title: 'text-green-600 dark:text-green-400'
    },
    warning: {
      card: 'border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/20',
      icon: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
      value: 'text-yellow-700 dark:text-yellow-400',
      title: 'text-yellow-600 dark:text-yellow-400'
    },
    danger: {
      card: 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20',
      icon: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
      value: 'text-red-700 dark:text-red-400',
      title: 'text-red-600 dark:text-red-400'
    },
    info: {
      card: 'border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/20',
      icon: 'text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/30',
      value: 'text-cyan-700 dark:text-cyan-400',
      title: 'text-cyan-600 dark:text-cyan-400'
    }
  }

  const style = variants[variant]

  // Size variants
  const sizes = {
    sm: {
      padding: 'p-3',
      icon: 'h-8 w-8 p-1.5',
      iconSize: 'h-5 w-5',
      value: 'text-xl',
      title: 'text-xs',
      subtitle: 'text-xs'
    },
    md: {
      padding: 'p-4',
      icon: 'h-10 w-10 p-2',
      iconSize: 'h-6 w-6',
      value: 'text-2xl',
      title: 'text-sm',
      subtitle: 'text-sm'
    },
    lg: {
      padding: 'p-6',
      icon: 'h-12 w-12 p-2.5',
      iconSize: 'h-7 w-7',
      value: 'text-3xl',
      title: 'text-base',
      subtitle: 'text-base'
    }
  }

  const sizeConfig = sizes[size]

  return (
    <Card className={cn(style.card, 'border transition-all hover:shadow-md', className)}>
      <CardContent className={sizeConfig.padding}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className={cn('font-medium mb-1', style.title, sizeConfig.title)}>
              {title}
            </p>
            <p className={cn('font-bold tracking-tight', style.value, sizeConfig.value)}>
              {value}
            </p>
            {subtitle && (
              <p className={cn('text-muted-foreground mt-1', sizeConfig.subtitle)}>
                {subtitle}
              </p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-2">
                <span
                  className={cn(
                    'text-xs font-medium',
                    trend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
                </span>
                <span className="text-xs text-muted-foreground">vs last batch</span>
              </div>
            )}
          </div>
          {Icon && (
            <div className={cn('rounded-lg flex items-center justify-center', style.icon, sizeConfig.icon)}>
              <Icon className={sizeConfig.iconSize} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * StatCardGrid - Responsive grid for multiple stat cards
 */
interface StatCardGridProps {
  children: React.ReactNode
  columns?: 2 | 3 | 4 | 5
  className?: string
}

export function StatCardGrid({ children, columns = 4, className }: StatCardGridProps) {
  const gridCols = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
  }

  return (
    <div className={cn('grid gap-4', gridCols[columns], className)}>
      {children}
    </div>
  )
}
