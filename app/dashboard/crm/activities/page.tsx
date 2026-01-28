'use client'

import { useState, useEffect } from 'react'
import { Activity as ActivityIcon, Plus, Filter } from 'lucide-react'
import { ActivityTimeline } from '@/components/crm/ActivityTimeline'
import { ActivityFormModal } from '@/components/crm/ActivityFormModal'

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchActivities()
  }, [selectedType])

  const fetchActivities = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedType) {
        params.append('type', selectedType)
      }
      params.append('limit', '100')

      const response = await fetch(`/api/crm/activities?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setActivities(data.activities || [])
      }
    } catch (error) {
      console.error('Error fetching activities:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Activities</h1>
          <p className="text-slate-600 dark:text-slate-400">View all interactions across companies and contacts</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Log Activity</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Total Activities</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{activities.length}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">This Week</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {activities.filter(a => {
              const date = new Date(a.activityDate || a.createdAt)
              const weekAgo = new Date()
              weekAgo.setDate(weekAgo.getDate() - 7)
              return date >= weekAgo
            }).length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">This Month</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {activities.filter(a => {
              const date = new Date(a.activityDate || a.createdAt)
              const monthAgo = new Date()
              monthAgo.setMonth(monthAgo.getMonth() - 1)
              return date >= monthAgo
            }).length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Today</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {activities.filter(a => {
              const date = new Date(a.activityDate || a.createdAt)
              const today = new Date()
              return date.toDateString() === today.toDateString()
            }).length}
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
          </div>
        ) : (
          <ActivityTimeline
            activities={activities}
            showFilters
            onFilterChange={(type) => setSelectedType(type)}
          />
        )}

        {!loading && activities.length === 0 && (
          <div className="text-center py-12">
            <ActivityIcon className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-600 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No activities yet</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Start logging activities to track your interactions
            </p>
            <button
              onClick={() => console.log('Create activity')}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
            >
              Log Your First Activity
            </button>
          </div>
        )}
      </div>

      {/* Create Activity Modal */}
      <ActivityFormModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false)
          fetchActivities()
        }}
      />
    </div>
  )
}
