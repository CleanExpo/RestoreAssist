'use client'

import React from 'react'
import {
  CheckCircle2,
  Circle,
  Calendar,
  Building2,
  User,
  Flag,
  AlertCircle,
  Clock
} from 'lucide-react'

interface CrmTask {
  id: string
  title: string
  description?: string
  status: 'TODO' | 'IN_PROGRESS' | 'WAITING' | 'COMPLETED' | 'CANCELLED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  dueDate?: Date | string | null
  completedAt?: Date | string | null
  company?: {
    id: string
    name: string
  }
  contact?: {
    id: string
    fullName: string
  }
  assignedTo?: {
    id: string
    name: string | null
    email: string | null
  }
}

interface TaskListProps {
  tasks: CrmTask[]
  onTaskClick?: (task: CrmTask) => void
  onTaskComplete?: (taskId: string) => Promise<void>
  loading?: boolean
  showFilters?: boolean
}

export function TaskList({
  tasks,
  onTaskClick,
  onTaskComplete,
  loading = false,
  showFilters = true
}: TaskListProps) {
  const [selectedStatus, setSelectedStatus] = React.useState<string | null>(null)
  const [selectedPriority, setSelectedPriority] = React.useState<string | null>(null)

  const getPriorityColor = (priority: CrmTask['priority']) => {
    switch (priority) {
      case 'URGENT':
        return 'text-red-600 dark:text-red-400'
      case 'HIGH':
        return 'text-orange-600 dark:text-orange-400'
      case 'MEDIUM':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'LOW':
        return 'text-blue-600 dark:text-blue-400'
      default:
        return 'text-slate-600 dark:text-slate-400'
    }
  }

  const getStatusColor = (status: CrmTask['status']) => {
    switch (status) {
      case 'COMPLETED':
        return 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30'
      case 'IN_PROGRESS':
        return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30'
      case 'WAITING':
        return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30'
      case 'CANCELLED':
        return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
      case 'TODO':
      default:
        return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/30'
    }
  }

  const isOverdue = (task: CrmTask) => {
    if (!task.dueDate || task.status === 'COMPLETED') return false
    return new Date(task.dueDate) < new Date()
  }

  const formatDueDate = (date: Date | string | null | undefined) => {
    if (!date) return null
    const d = new Date(date)
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
    if (diffDays === 0) return 'Due today'
    if (diffDays === 1) return 'Due tomorrow'
    if (diffDays < 7) return `Due in ${diffDays}d`

    return d.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  const filteredTasks = tasks.filter(task => {
    if (selectedStatus && task.status !== selectedStatus) return false
    if (selectedPriority && task.priority !== selectedPriority) return false
    return true
  })

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    // Overdue first
    const aOverdue = isOverdue(a)
    const bOverdue = isOverdue(b)
    if (aOverdue && !bOverdue) return -1
    if (!aOverdue && bOverdue) return 1

    // Then by priority (URGENT > HIGH > MEDIUM > LOW)
    const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    const aPriority = priorityOrder[a.priority] ?? 4
    const bPriority = priorityOrder[b.priority] ?? 4
    if (aPriority !== bPriority) return aPriority - bPriority

    // Then by due date (earliest first)
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    }
    if (a.dueDate) return -1
    if (b.dueDate) return 1

    return 0
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Status:</span>
            <select
              value={selectedStatus || ''}
              onChange={(e) => setSelectedStatus(e.target.value || null)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">All</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="WAITING">Waiting</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Priority:</span>
            <select
              value={selectedPriority || ''}
              onChange={(e) => setSelectedPriority(e.target.value || null)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">All</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
      )}

      {/* Task List */}
      <div className="space-y-2">
        {loading && (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            Loading tasks...
          </div>
        )}

        {!loading && sortedTasks.length === 0 && (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500">
            No tasks found
          </div>
        )}

        {!loading && sortedTasks.map(task => {
          const overdue = isOverdue(task)
          const completed = task.status === 'COMPLETED'

          return (
            <div
              key={task.id}
              onClick={() => onTaskClick?.(task)}
              className={`flex items-start gap-3 p-4 rounded-lg border ${
                overdue
                  ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
              } hover:shadow-md transition-shadow cursor-pointer ${
                completed ? 'opacity-60' : ''
              }`}
            >
              {/* Checkbox */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (onTaskComplete) {
                    onTaskComplete(task.id)
                  }
                }}
                className="mt-1 flex-shrink-0"
              >
                {completed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="h-5 w-5 text-slate-400 dark:text-slate-600 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors" />
                )}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Title & Priority */}
                <div className="flex items-start gap-2 mb-1">
                  <h4 className={`font-semibold text-slate-900 dark:text-white flex-1 ${
                    completed ? 'line-through' : ''
                  }`}>
                    {task.title}
                  </h4>
                  <Flag className={`h-4 w-4 flex-shrink-0 ${getPriorityColor(task.priority)}`} />
                </div>

                {/* Description */}
                {task.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 line-clamp-1">
                    {task.description}
                  </p>
                )}

                {/* Meta Info */}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {/* Status */}
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                    {task.status.replace('_', ' ')}
                  </span>

                  {/* Due Date */}
                  {task.dueDate && (
                    <div className={`flex items-center gap-1 ${
                      overdue
                        ? 'text-red-600 dark:text-red-400 font-medium'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      <Calendar className="h-3.5 w-3.5" />
                      <span className="text-xs">{formatDueDate(task.dueDate)}</span>
                    </div>
                  )}

                  {/* Company */}
                  {task.company && (
                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                      <Building2 className="h-3.5 w-3.5" />
                      <span className="text-xs truncate max-w-[150px]">{task.company.name}</span>
                    </div>
                  )}

                  {/* Contact */}
                  {task.contact && (
                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                      <User className="h-3.5 w-3.5" />
                      <span className="text-xs truncate max-w-[150px]">{task.contact.fullName}</span>
                    </div>
                  )}

                  {/* Assignee */}
                  {task.assignedTo && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-cyan-500 text-white flex items-center justify-center text-[10px] font-semibold">
                        {task.assignedTo.name?.[0] || task.assignedTo.email?.[0] || '?'}
                      </div>
                      <span className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-[100px]">
                        {task.assignedTo.name || task.assignedTo.email}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Overdue Badge */}
              {overdue && (
                <div className="flex-shrink-0">
                  <div className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-xs font-medium">
                    <AlertCircle className="h-3 w-3" />
                    <span>Overdue</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
