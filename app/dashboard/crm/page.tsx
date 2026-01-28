'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  Users,
  Activity,
  CheckSquare,
  TrendingUp,
  Calendar,
  Plus
} from 'lucide-react'

export default function CRMDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [stats, setStats] = useState({
    totalCompanies: 0,
    totalContacts: 0,
    totalActivities: 0,
    openTasks: 0,
    recentActivities: [] as any[],
    upcomingTasks: [] as any[]
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchDashboardData()
    }
  }, [status])

  const fetchDashboardData = async () => {
    try {
      // Fetch companies count
      const companiesRes = await fetch('/api/crm/companies?limit=1')
      const companiesData = await companiesRes.json()

      // Fetch contacts count
      const contactsRes = await fetch('/api/crm/contacts?limit=1')
      const contactsData = await contactsRes.json()

      // Fetch recent activities
      const activitiesRes = await fetch('/api/crm/activities?limit=5')
      const activitiesData = await activitiesRes.json()

      // Fetch upcoming tasks
      const tasksRes = await fetch('/api/crm/tasks?status=TODO&limit=5')
      const tasksData = await tasksRes.json()

      setStats({
        totalCompanies: companiesData.pagination?.total || 0,
        totalContacts: contactsData.pagination?.total || 0,
        totalActivities: activitiesData.pagination?.total || 0,
        openTasks: tasksData.pagination?.total || 0,
        recentActivities: activitiesData.activities || [],
        upcomingTasks: tasksData.tasks || []
      })
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          CRM Dashboard
        </h1>
        <div className="flex gap-3">
          <Link
            href="/dashboard/crm/companies"
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
          >
            <Building2 className="h-5 w-5" />
            Companies
          </Link>
          <Link
            href="/dashboard/crm/contacts"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:scale-[1.02] transition-transform"
          >
            <Users className="h-5 w-5" />
            Contacts
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Building2 className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {stats.totalCompanies}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Companies
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-cyan-500/10 rounded-lg">
              <Users className="h-6 w-6 text-cyan-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {stats.totalContacts}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Contacts
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <Activity className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {stats.totalActivities}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Activities
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-lg">
              <CheckSquare className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {stats.openTasks}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Open Tasks
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity and Upcoming Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Activities */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-500" />
            Recent Activities
          </h2>
          {stats.recentActivities.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No activities yet
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30"
                >
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-white text-sm">
                      {activity.subject}
                    </div>
                    {activity.description && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                        {activity.description}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      {new Date(activity.activityDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Tasks */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-amber-500" />
            Upcoming Tasks
          </h2>
          {stats.upcomingTasks.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No upcoming tasks
            </p>
          ) : (
            <div className="space-y-3">
              {stats.upcomingTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30"
                >
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-white text-sm">
                      {task.title}
                    </div>
                    {task.dueDate && (
                      <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 mt-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(task.dueDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      task.priority === 'URGENT'
                        ? 'bg-red-500/10 text-red-500'
                        : task.priority === 'HIGH'
                        ? 'bg-orange-500/10 text-orange-500'
                        : 'bg-blue-500/10 text-blue-500'
                    }`}
                  >
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
