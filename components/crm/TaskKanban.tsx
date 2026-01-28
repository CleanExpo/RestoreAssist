'use client'

import React, { useState } from 'react'
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building2,
  User,
  Flag,
  Plus,
  GripVertical,
  Filter,
  X,
  PauseCircle
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

interface TaskKanbanProps {
  tasks: CrmTask[]
  onTaskMove?: (taskId: string, newStatus: CrmTask['status']) => Promise<void>
  onTaskClick?: (task: CrmTask) => void
  onAddTask?: (status: CrmTask['status']) => void
  loading?: boolean
  showFilters?: boolean
}

export function TaskKanban({
  tasks,
  onTaskMove,
  onTaskClick,
  onAddTask,
  loading = false,
  showFilters = false
}: TaskKanbanProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null)
  const [dueDateFilter, setDueDateFilter] = useState<'all' | 'overdue' | 'today' | 'week'>('all')

  const columns = [
    {
      id: 'TODO',
      title: 'To Do',
      icon: Clock,
      color: 'text-slate-600 dark:text-slate-400',
      bgColor: 'bg-slate-100 dark:bg-slate-800',
      borderColor: 'border-slate-300 dark:border-slate-700'
    },
    {
      id: 'IN_PROGRESS',
      title: 'In Progress',
      icon: AlertCircle,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      borderColor: 'border-blue-300 dark:border-blue-700'
    },
    {
      id: 'WAITING',
      title: 'Waiting',
      icon: PauseCircle,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      borderColor: 'border-amber-300 dark:border-amber-700'
    },
    {
      id: 'COMPLETED',
      title: 'Completed',
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      borderColor: 'border-emerald-300 dark:border-emerald-700'
    }
  ]

  const getPriorityColor = (priority: CrmTask['priority']) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-red-500 text-white'
      case 'HIGH':
        return 'bg-orange-500 text-white'
      case 'MEDIUM':
        return 'bg-yellow-500 text-white'
      case 'LOW':
        return 'bg-blue-500 text-white'
      default:
        return 'bg-slate-500 text-white'
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
      month: 'short'
    })
  }

  const getTasksByStatus = (status: string) => {
    let filtered = tasks.filter(task => task.status === status)

    // Apply assignee filter
    if (selectedAssignee) {
      filtered = filtered.filter(task => task.assignedTo?.id === selectedAssignee)
    }

    // Apply due date filter
    if (dueDateFilter !== 'all') {
      const now = new Date()
      filtered = filtered.filter(task => {
        if (!task.dueDate) return false

        const dueDate = new Date(task.dueDate)
        if (dueDateFilter === 'overdue') {
          return dueDate < now && task.status !== 'COMPLETED'
        } else if (dueDateFilter === 'today') {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          const tomorrow = new Date(today)
          tomorrow.setDate(tomorrow.getDate() + 1)
          return dueDate >= today && dueDate < tomorrow
        } else if (dueDateFilter === 'week') {
          const weekFromNow = new Date(now)
          weekFromNow.setDate(weekFromNow.getDate() + 7)
          return dueDate <= weekFromNow
        }
        return true
      })
    }

    return filtered
  }

  // Get unique assignees for filter dropdown
  const uniqueAssignees = Array.from(
    new Map(
      tasks
        .filter(task => task.assignedTo)
        .map(task => [task.assignedTo!.id, task.assignedTo!])
    ).values()
  )

  const clearFilters = () => {
    setSelectedAssignee(null)
    setDueDateFilter('all')
  }

  const hasActiveFilters = selectedAssignee || dueDateFilter !== 'all'

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(columnId)
  }

  const handleDragLeave = () => {
    setDragOverColumn(null)
  }

  const handleDrop = async (e: React.DragEvent, newStatus: CrmTask['status']) => {
    e.preventDefault()
    setDragOverColumn(null)

    if (!draggedTaskId || !onTaskMove) return

    const task = tasks.find(t => t.id === draggedTaskId)
    if (!task || task.status === newStatus) {
      setDraggedTaskId(null)
      return
    }

    try {
      await onTaskMove(draggedTaskId, newStatus)
    } catch (error) {
      console.error('Failed to move task:', error)
    }

    setDraggedTaskId(null)
  }

  const handleDragEnd = () => {
    setDraggedTaskId(null)
    setDragOverColumn(null)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Filters:
            </span>
          </div>

          {/* Assignee Filter */}
          <select
            value={selectedAssignee || ''}
            onChange={(e) => setSelectedAssignee(e.target.value || null)}
            className="px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">All Assignees</option>
            {uniqueAssignees.map(assignee => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name || assignee.email}
              </option>
            ))}
          </select>

          {/* Due Date Filter */}
          <div className="flex items-center gap-1">
            {(['all', 'overdue', 'today', 'week'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setDueDateFilter(filter)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  dueDateFilter === filter
                    ? 'bg-cyan-500 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {filter === 'all' ? 'All Dates' : filter === 'overdue' ? 'Overdue' : filter === 'today' ? 'Due Today' : 'This Week'}
              </button>
            ))}
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-2 py-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}

          {/* Task Count */}
          <div className="ml-auto text-sm text-slate-600 dark:text-slate-400">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(column => {
        const columnTasks = getTasksByStatus(column.id)
        const Icon = column.icon

        return (
          <div
            key={column.id}
            className="flex-1 min-w-[320px] flex flex-col"
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id as CrmTask['status'])}
          >
            {/* Column Header */}
            <div className={`flex items-center justify-between p-3 rounded-t-lg border-b-2 ${column.bgColor} ${column.borderColor}`}>
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${column.color}`} />
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {column.title}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${column.bgColor} ${column.color}`}>
                  {columnTasks.length}
                </span>
              </div>
              {onAddTask && (
                <button
                  onClick={() => onAddTask(column.id as CrmTask['status'])}
                  className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${column.color}`}
                  title="Add task"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Column Content */}
            <div
              className={`flex-1 p-3 space-y-3 rounded-b-lg border-2 ${
                dragOverColumn === column.id
                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50'
              } min-h-[400px] transition-colors`}
            >
              {loading && (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  Loading tasks...
                </div>
              )}

              {!loading && columnTasks.length === 0 && (
                <div className="text-center py-8 text-slate-400 dark:text-slate-500">
                  No tasks
                </div>
              )}

              {!loading && columnTasks.map(task => {
                const overdue = isOverdue(task)

                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onTaskClick?.(task)}
                    className={`bg-white dark:bg-slate-800 rounded-lg border ${
                      overdue
                        ? 'border-red-300 dark:border-red-700'
                        : 'border-slate-200 dark:border-slate-700'
                    } p-3 shadow-sm cursor-move hover:shadow-md transition-shadow ${
                      draggedTaskId === task.id ? 'opacity-50' : 'opacity-100'
                    }`}
                  >
                    {/* Drag Handle & Priority */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-slate-400 dark:text-slate-600 flex-shrink-0" />
                        <div className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${getPriorityColor(task.priority)}`}>
                          <Flag className="h-3 w-3" />
                          <span>{task.priority}</span>
                        </div>
                      </div>
                      {overdue && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-xs font-medium">
                          <AlertCircle className="h-3 w-3" />
                          <span>Overdue</span>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-2">
                      {task.title}
                    </h4>

                    {/* Description */}
                    {task.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {/* Due Date */}
                    {task.dueDate && (
                      <div className={`flex items-center gap-1.5 text-xs mb-2 ${
                        overdue
                          ? 'text-red-600 dark:text-red-400 font-medium'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formatDueDate(task.dueDate)}</span>
                      </div>
                    )}

                    {/* Related Entities */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {task.company && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded text-xs">
                          <Building2 className="h-3 w-3" />
                          <span className="truncate max-w-[120px]">{task.company.name}</span>
                        </div>
                      )}
                      {task.contact && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-xs">
                          <User className="h-3 w-3" />
                          <span className="truncate max-w-[120px]">{task.contact.fullName}</span>
                        </div>
                      )}
                    </div>

                    {/* Assignee */}
                    {task.assignedTo && (
                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-cyan-500 text-white flex items-center justify-center text-xs font-semibold">
                            {task.assignedTo.name?.[0] || task.assignedTo.email?.[0] || '?'}
                          </div>
                          <span className="text-xs text-slate-600 dark:text-slate-400 truncate">
                            {task.assignedTo.name || task.assignedTo.email}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}
