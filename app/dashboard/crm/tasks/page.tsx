'use client'

import { useState, useEffect } from 'react'
import { Plus, LayoutGrid, List as ListIcon, CheckSquare } from 'lucide-react'
import { TaskKanban } from '@/components/crm/TaskKanban'
import { TaskList } from '@/components/crm/TaskList'
import toast from 'react-hot-toast'

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/crm/tasks?limit=200')
      if (response.ok) {
        const data = await response.json()
        setTasks(data.tasks || [])
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTaskMove = async (taskId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/crm/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        toast.success('Task updated')
        fetchTasks()
      }
    } catch (error) {
      console.error('Failed to move task:', error)
      toast.error('Failed to update task')
    }
  }

  const handleTaskComplete = async (taskId: string) => {
    try {
      await fetch(`/api/crm/tasks/${taskId}/complete`, { method: 'POST' })
      toast.success('Task marked as complete')
      fetchTasks()
    } catch (error) {
      console.error('Failed to complete task:', error)
      toast.error('Failed to complete task')
    }
  }

  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length
  const pendingTasks = tasks.filter(t => t.status === 'PENDING' || t.status === 'OVERDUE').length
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tasks</h1>
          <p className="text-slate-600 dark:text-slate-400">Manage and track your CRM tasks</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="text-sm font-medium">Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ListIcon className="h-4 w-4" />
              <span className="text-sm font-medium">List</span>
            </button>
          </div>

          <button
            onClick={() => {
              // TODO: Open create task modal
              console.log('Create task')
            }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Total Tasks</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{tasks.length}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Pending</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{pendingTasks}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">In Progress</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{inProgressTasks}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Completed</div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedTasks}</div>
        </div>
      </div>

      {/* Task Views */}
      {loading ? (
        <div className="flex items-center justify-center py-12 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <CheckSquare className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No tasks yet</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Create your first task to get started
          </p>
          <button
            onClick={() => console.log('Create task')}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
          >
            Create Your First Task
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          {viewMode === 'kanban' ? (
            <TaskKanban
              tasks={tasks}
              onTaskMove={handleTaskMove}
              onTaskClick={(task) => console.log('Task clicked:', task)}
              onAddTask={(status) => console.log('Add task to', status)}
            />
          ) : (
            <TaskList
              tasks={tasks}
              onTaskComplete={handleTaskComplete}
              onTaskClick={(task) => console.log('Task clicked:', task)}
              showFilters
            />
          )}
        </div>
      )}
    </div>
  )
}
