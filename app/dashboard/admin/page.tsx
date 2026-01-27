'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Users,
  Building2,
  CreditCard,
  Activity,
  Shield,
  Settings,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface AdminStats {
  totalUsers: number
  activeUsers: number
  totalOrganizations: number
  activeSubscriptions: number
  totalReports: number
  reportsThisMonth: number
  systemHealth: {
    database: 'healthy' | 'degraded' | 'down'
    api: 'healthy' | 'degraded' | 'down'
    integrations: 'healthy' | 'degraded' | 'down'
  }
}

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (session?.user?.role !== 'ADMIN') {
      router.push('/dashboard')
      return
    }
    fetchStats()
  }, [status, session, router])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error fetching admin stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchStats()
    setRefreshing(false)
  }

  const getHealthBadge = (status: 'healthy' | 'degraded' | 'down') => {
    const variants = {
      healthy: 'bg-green-500/10 text-green-600 dark:text-green-400',
      degraded: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      down: 'bg-red-500/10 text-red-600 dark:text-red-400',
    }
    const icons = {
      healthy: CheckCircle,
      degraded: Clock,
      down: AlertCircle,
    }
    const Icon = icons[status]
    return (
      <Badge className={cn('gap-1', variants[status])}>
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Shield className="h-12 w-12 text-neutral-400" />
        <p className="text-neutral-600 dark:text-neutral-400">
          Admin access required
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Admin Dashboard
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            System overview and management
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* System Health */}
      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Activity className="h-5 w-5 text-cyan-500" />
            System Health
          </CardTitle>
          <CardDescription>Real-time status of system components</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800">
              <span className="text-neutral-600 dark:text-neutral-400">Database</span>
              {stats ? getHealthBadge(stats.systemHealth.database) : getHealthBadge('healthy')}
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800">
              <span className="text-neutral-600 dark:text-neutral-400">API Services</span>
              {stats ? getHealthBadge(stats.systemHealth.api) : getHealthBadge('healthy')}
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800">
              <span className="text-neutral-600 dark:text-neutral-400">Integrations</span>
              {stats ? getHealthBadge(stats.systemHealth.integrations) : getHealthBadge('healthy')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-cyan-500/10">
                <Users className="h-6 w-6 text-cyan-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  {stats?.totalUsers ?? '-'}
                </p>
                <p className="text-sm text-neutral-500">Total Users</p>
                <p className="text-xs text-green-500">
                  {stats?.activeUsers ?? 0} active
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-violet-500/10">
                <Building2 className="h-6 w-6 text-violet-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  {stats?.totalOrganizations ?? '-'}
                </p>
                <p className="text-sm text-neutral-500">Organizations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <CreditCard className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  {stats?.activeSubscriptions ?? '-'}
                </p>
                <p className="text-sm text-neutral-500">Active Subscriptions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-amber-500/10">
                <TrendingUp className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  {stats?.totalReports ?? '-'}
                </p>
                <p className="text-sm text-neutral-500">Total Reports</p>
                <p className="text-xs text-cyan-500">
                  {stats?.reportsThisMonth ?? 0} this month
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Settings className="h-5 w-5 text-cyan-500" />
            Quick Actions
          </CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              variant="outline"
              className="flex-col h-auto py-4 gap-2"
              onClick={() => router.push('/dashboard/team')}
            >
              <Users className="h-5 w-5" />
              <span className="text-sm">Manage Team</span>
            </Button>
            <Button
              variant="outline"
              className="flex-col h-auto py-4 gap-2"
              onClick={() => router.push('/dashboard/subscription')}
            >
              <CreditCard className="h-5 w-5" />
              <span className="text-sm">Subscription</span>
            </Button>
            <Button
              variant="outline"
              className="flex-col h-auto py-4 gap-2"
              onClick={() => router.push('/dashboard/analytics')}
            >
              <TrendingUp className="h-5 w-5" />
              <span className="text-sm">Analytics</span>
            </Button>
            <Button
              variant="outline"
              className="flex-col h-auto py-4 gap-2"
              onClick={() => router.push('/dashboard/settings')}
            >
              <Settings className="h-5 w-5" />
              <span className="text-sm">Settings</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
