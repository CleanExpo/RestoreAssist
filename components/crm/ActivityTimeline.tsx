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
  Clock
} from 'lucide-react'

interface Activity {
  id: string
  type: string
  subject: string
  description?: string
  outcome?: string
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
  showFilters?: boolean
  onFilterChange?: (type: string | null) => void
}

export function ActivityTimeline({
  activities,
  showFilters = false,
  onFilterChange
}: ActivityTimelineProps) {
  const [selectedType, setSelectedType] = React.useState<string | null>(null)

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'CALL':
        return Phone
      case 'EMAIL':
        return Mail
      case 'MEETING':
        return Calendar
      case 'NOTE':
        return FileText
      case 'MESSAGE':
        return MessageSquare
      case 'TASK':
        return CheckSquare
      default:
        return Users
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

  const filteredActivities = selectedType
    ? activities.filter(a => a.type === selectedType)
    : activities

  const activityTypes = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'MESSAGE', 'TASK']

  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleFilterChange(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedType === null
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            All
          </button>
          {activityTypes.map(type => {
            const Icon = getActivityIcon(type)
            const colors = getActivityColor(type)
            return (
              <button
                key={type}
                onClick={() => handleFilterChange(type)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedType === type
                    ? `${colors.bg} ${colors.icon} ring-2 ${colors.border.replace('border-', 'ring-')}`
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="capitalize">{type.toLowerCase()}</span>
              </button>
            )
          })}
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

        {filteredActivities.map((activity, index) => {
          const Icon = getActivityIcon(activity.type)
          const colors = getActivityColor(activity.type)

          return (
            <div key={activity.id} className="relative flex gap-4">
              {/* Icon */}
              <div className={`relative z-10 flex items-center justify-center h-9 w-9 rounded-full border-2 ${colors.bg} ${colors.border}`}>
                <Icon className={`h-4 w-4 ${colors.icon}`} />
              </div>

              {/* Content */}
              <div className="flex-1 pb-6">
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900 dark:text-white">
                        {activity.subject}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-sm text-slate-600 dark:text-slate-400">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.icon}`}>
                          {activity.type}
                        </span>
                        {activity.user && (
                          <span>by {activity.user.name || activity.user.email}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatDate(activity.activityDate || activity.createdAt)}</span>
                    </div>
                  </div>

                  {/* Description */}
                  {activity.description && (
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                      {activity.description}
                    </p>
                  )}

                  {/* Outcome */}
                  {activity.outcome && (
                    <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-200 dark:border-slate-700">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Outcome:</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{activity.outcome}</p>
                    </div>
                  )}

                  {/* Related entities */}
                  <div className="flex flex-wrap gap-2 mt-3">
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
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
