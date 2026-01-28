'use client'

import React from 'react'
import {
  Phone,
  Mail,
  Calendar,
  FileText,
  MessageSquare,
  CheckSquare,
  Users,
  Clock,
  MapPin,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Filter,
  X
} from 'lucide-react'

interface Activity {
  id: string
  type: string
  subject: string
  description?: string
  outcome?: string
  duration?: number
  activityDate?: Date | string
  createdAt: Date | string
  user?: {
    id: string
    name: string | null
    email: string | null
  }
  contact?: {
    id: string
    fullName: string
    email: string | null
  }
  company?: {
    id: string
    name: string
  }
}

interface ActivityTimelineProps {
  activities: Activity[]
  loading?: boolean
  showFilters?: boolean
  compactMode?: boolean
  maxItems?: number
  onFilterChange?: (type: string | null) => void
  onActivityClick?: (activity: Activity) => void
}

export function ActivityTimeline({
  activities,
  loading = false,
  showFilters = false,
  compactMode = false,
  maxItems,
  onFilterChange,
  onActivityClick
}: ActivityTimelineProps) {
  const [selectedType, setSelectedType] = React.useState<string | null>(null)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [dateFilter, setDateFilter] = React.useState<'all' | 'today' | 'week' | 'month'>('all')
  const [showFilterMenu, setShowFilterMenu] = React.useState(false)

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedIds)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedIds(newExpanded)
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'CALL':
        return Phone
      case 'EMAIL':
        return Mail
      case 'MEETING':
        return Calendar
      case 'SITE_VISIT':
        return MapPin
      case 'NOTE':
        return FileText
      case 'MESSAGE':
      case 'QUOTE_SENT':
        return MessageSquare
      case 'TASK':
        return CheckSquare
      case 'FOLLOW_UP':
        return Clock
      case 'PORTAL_ACCESS':
      case 'APPROVAL':
        return CheckCircle
      default:
        return AlertCircle
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'CALL':
        return { icon: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-300 dark:border-blue-700' }
      case 'EMAIL':
        return { icon: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-purple-300 dark:border-purple-700' }
      case 'MEETING':
        return { icon: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-300 dark:border-emerald-700' }
      case 'NOTE':
        return { icon: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-300 dark:border-amber-700' }
      case 'MESSAGE':
        return { icon: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-100 dark:bg-cyan-900/30', border: 'border-cyan-300 dark:border-cyan-700' }
      case 'TASK':
        return { icon: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-300 dark:border-green-700' }
      default:
        return { icon: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-900/30', border: 'border-slate-300 dark:border-slate-700' }
    }
  }

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return d.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  const handleFilterChange = (type: string | null) => {
    setSelectedType(type)
    if (onFilterChange) {
      onFilterChange(type)
    }
  }

  const clearFilters = () => {
    setSelectedType(null)
    setDateFilter('all')
    if (onFilterChange) {
      onFilterChange(null)
    }
  }

  // Apply filters
  let filteredActivities = selectedType
    ? activities.filter(a => a.type === selectedType)
    : activities

  // Apply date filter
  if (dateFilter !== 'all') {
    const now = new Date()
    const filterDate = new Date()

    if (dateFilter === 'today') {
      filterDate.setHours(0, 0, 0, 0)
    } else if (dateFilter === 'week') {
      filterDate.setDate(now.getDate() - 7)
    } else if (dateFilter === 'month') {
      filterDate.setMonth(now.getMonth() - 1)
    }

    filteredActivities = filteredActivities.filter(activity =>
      new Date(activity.activityDate || activity.createdAt) >= filterDate
    )
  }

  // Apply max items limit
  if (maxItems) {
    filteredActivities = filteredActivities.slice(0, maxItems)
  }

  const activityTypes = ['CALL', 'EMAIL', 'MEETING', 'SITE_VISIT', 'NOTE', 'QUOTE_SENT', 'FOLLOW_UP', 'APPROVAL']

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 animate-pulse">
            <div className="w-9 h-9 bg-slate-200 dark:bg-slate-700 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Filter className="h-4 w-4" />
                <span>Filter</span>
                {(selectedType || dateFilter !== 'all') && (
                  <span className="px-1.5 py-0.5 bg-cyan-500 text-white text-xs rounded-full">
                    {(selectedType ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0)}
                  </span>
                )}
              </button>

              {/* Date Filter Buttons */}
              <div className="flex items-center gap-1">
                {(['all', 'today', 'week', 'month'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setDateFilter(filter)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      dateFilter === filter
                        ? 'bg-cyan-500 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter === 'today' ? 'Today' : filter === 'week' ? 'Week' : 'Month'}
                  </button>
                ))}
              </div>

              {(selectedType || dateFilter !== 'all') && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-2 py-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>

            <div className="text-sm text-slate-600 dark:text-slate-400">
              {filteredActivities.length} {filteredActivities.length === 1 ? 'activity' : 'activities'}
            </div>
          </div>

          {/* Type Filter Menu */}
          {showFilterMenu && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  handleFilterChange(null)
                  setShowFilterMenu(false)
                }}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  selectedType === null
                    ? 'bg-cyan-500 text-white border-cyan-500'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-cyan-500'
                }`}
              >
                All Types
              </button>
              {activityTypes.map(type => {
                const Icon = getActivityIcon(type)
                return (
                  <button
                    key={type}
                    onClick={() => {
                      handleFilterChange(type)
                      setShowFilterMenu(false)
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      selectedType === type
                        ? 'bg-cyan-500 text-white border-cyan-500'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-cyan-500'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="capitalize">{type.toLowerCase().replace('_', ' ')}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="relative space-y-4">
        {/* Vertical line */}
        <div className="absolute left-[17px] top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

        {filteredActivities.length === 0 && (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            No activities found
          </div>
        )}

        {filteredActivities.map((activity) => {
          const Icon = getActivityIcon(activity.type)
          const colors = getActivityColor(activity.type)
          const isExpanded = expandedIds.has(activity.id)
          const hasDetails = activity.description || activity.outcome || activity.duration

          return (
            <div key={activity.id} className="relative flex gap-4">
              {/* Icon */}
              <div className={`relative z-10 flex items-center justify-center h-9 w-9 rounded-full border-2 ${colors.bg} ${colors.border}`}>
                <Icon className={`h-4 w-4 ${colors.icon}`} />
              </div>

              {/* Content */}
              <div className="flex-1 pb-6">
                <div
                  className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm ${
                    onActivityClick ? 'cursor-pointer hover:border-cyan-500 dark:hover:border-cyan-500 transition-colors' : ''
                  } ${compactMode ? 'p-3' : 'p-4'}`}
                  onClick={() => onActivityClick?.(activity)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                        {activity.subject}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-sm text-slate-600 dark:text-slate-400 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.icon}`}>
                          {activity.type.replace('_', ' ')}
                        </span>
                        {activity.duration && (
                          <>
                            <span>•</span>
                            <span>{activity.duration} min</span>
                          </>
                        )}
                        {activity.user && (
                          <>
                            <span>•</span>
                            <span>by {activity.user.name || activity.user.email}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        <span className="whitespace-nowrap">{formatDate(activity.activityDate || activity.createdAt)}</span>
                      </div>
                      {hasDetails && !compactMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpanded(activity.id)
                          }}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Related entities */}
                  {(activity.contact || activity.company) && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {activity.contact && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-xs">
                          <Users className="h-3 w-3" />
                          <span>{activity.contact.fullName}</span>
                        </div>
                      )}
                      {activity.company && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded text-xs">
                          <Users className="h-3 w-3" />
                          <span>{activity.company.name}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expanded details */}
                  {isExpanded && hasDetails && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                      {/* Description */}
                      {activity.description && (
                        <div>
                          <p className="text-sm text-slate-700 dark:text-slate-300">
                            {activity.description}
                          </p>
                        </div>
                      )}

                      {/* Outcome */}
                      {activity.outcome && (
                        <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-200 dark:border-slate-700">
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-1">Outcome</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{activity.outcome}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
