'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  CheckCircle2,
  ExternalLink,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import { formatDistanceToNow, isToday, isWithinInterval, subDays } from 'date-fns'
import toast from 'react-hot-toast'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType = 'info' | 'success' | 'warning' | 'error'

interface Notification {
  id: string
  title: string
  message: string
  type: NotificationType
  read: boolean
  createdAt: string | Date
  link?: string | null
}

interface NotificationPreferences {
  newReport: boolean
  inspectionComplete: boolean
  paymentReceived: boolean
  syncError: boolean
  systemAlert: boolean
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  newReport: true,
  inspectionComplete: true,
  paymentReceived: true,
  syncError: true,
  systemAlert: true,
}

const PREFS_STORAGE_KEY = 'ra_notification_preferences'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTypeConfig(type: NotificationType) {
  switch (type) {
    case 'success':
      return {
        Icon: CheckCircle,
        badgeClass: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
        label: 'Success',
      }
    case 'warning':
      return {
        Icon: AlertTriangle,
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        label: 'Warning',
      }
    case 'error':
      return {
        Icon: XCircle,
        badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
        label: 'Error',
      }
    case 'info':
    default:
      return {
        Icon: Info,
        badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
        label: 'Info',
      }
  }
}

function groupNotifications(notifications: Notification[]) {
  const today: Notification[] = []
  const thisWeek: Notification[] = []
  const older: Notification[] = []

  const now = new Date()
  const weekAgo = subDays(now, 7)

  for (const n of notifications) {
    const date = new Date(n.createdAt)
    if (isToday(date)) {
      today.push(n)
    } else if (isWithinInterval(date, { start: weekAgo, end: now })) {
      thisWeek.push(n)
    } else {
      older.push(n)
    }
  }

  return { today, thisWeek, older }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4 border-b border-neutral-200 dark:border-neutral-800 last:border-0">
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

interface NotificationRowProps {
  notification: Notification
  onRead: (id: string, link?: string | null) => void
}

function NotificationRow({ notification, onRead }: NotificationRowProps) {
  const { Icon, badgeClass, label } = getTypeConfig(notification.type)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onRead(notification.id, notification.link)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onRead(notification.id, notification.link)
      }}
      className={cn(
        'flex items-start gap-3 p-4 cursor-pointer transition-colors',
        'hover:bg-neutral-50 dark:hover:bg-neutral-800/60',
        'border-b border-neutral-200 dark:border-neutral-800 last:border-0',
        !notification.read && [
          'border-l-2 border-l-cyan-500',
          'bg-cyan-500/5 dark:bg-cyan-500/5',
        ],
      )}
    >
      {/* Type icon */}
      <div
        className={cn(
          'flex-shrink-0 mt-0.5 flex items-center justify-center h-8 w-8 rounded-full',
          badgeClass,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={cn(
              'text-sm text-neutral-900 dark:text-white truncate',
              !notification.read && 'font-semibold',
            )}
          >
            {notification.title}
          </p>
          {!notification.read && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 flex-shrink-0"
            >
              New
            </Badge>
          )}
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* External link indicator */}
      {notification.link && (
        <ExternalLink className="h-4 w-4 flex-shrink-0 mt-1 text-neutral-400 dark:text-neutral-500" />
      )}
    </div>
  )
}

interface NotificationGroupProps {
  label: string
  notifications: Notification[]
  onRead: (id: string, link?: string | null) => void
}

function NotificationGroup({ label, notifications, onRead }: NotificationGroupProps) {
  if (notifications.length === 0) return null

  return (
    <div>
      <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800/40 border-b border-neutral-200 dark:border-neutral-800">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          {label}
        </p>
      </div>
      {notifications.map((n) => (
        <NotificationRow key={n.id} notification={n} onRead={onRead} />
      ))}
    </div>
  )
}

// ─── Preference toggle row ─────────────────────────────────────────────────────

interface PrefRowProps {
  id: keyof NotificationPreferences
  label: string
  description: string
  checked: boolean
  onToggle: (id: keyof NotificationPreferences, value: boolean) => void
}

function PrefRow({ id, label, description, checked, onToggle }: PrefRowProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-neutral-900 dark:text-white">{label}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={(value) => onToggle(id, value)}
        aria-label={`Toggle ${label} notifications`}
      />
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES)
  const [savingPrefs, setSavingPrefs] = useState(false)

  // ── Load preferences from localStorage ──────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFS_STORAGE_KEY)
      if (stored) {
        setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(stored) })
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  // ── Fetch notifications ──────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/notifications')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setNotifications(data.notifications ?? [])
    } catch {
      setError('Could not load notifications. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // ── Mark single notification as read + navigate ───────────────────────────────
  const handleRead = useCallback(
    async (id: string, link?: string | null) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      )

      try {
        await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
      } catch {
        // non-critical — optimistic update stands
      }

      if (link) {
        router.push(link)
      }
    },
    [router],
  )

  // ── Mark all as read ─────────────────────────────────────────────────────────
  const handleMarkAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))

    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
      toast.success('All notifications marked as read')
    } catch {
      toast.error('Failed to mark all as read')
    }
  }, [])

  // ── Update preferences ───────────────────────────────────────────────────────
  const handlePrefToggle = useCallback(
    (id: keyof NotificationPreferences, value: boolean) => {
      setPreferences((prev) => ({ ...prev, [id]: value }))
    },
    [],
  )

  const handleSavePrefs = useCallback(async () => {
    setSavingPrefs(true)
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(preferences))
      // Also persist to user profile for future cross-device sync
      await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationPreferences: preferences }),
      })
      toast.success('Notification preferences saved')
    } catch {
      // Still saved locally — treat as success
      toast.success('Preferences saved locally')
    } finally {
      setSavingPrefs(false)
    }
  }, [preferences])

  // ── Derived data ─────────────────────────────────────────────────────────────
  const unreadCount = notifications.filter((n) => !n.read).length
  const { today, thisWeek, older } = groupNotifications(notifications)
  const hasAnyNotification = notifications.length > 0

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <Badge className="bg-cyan-500 text-white hover:bg-cyan-600 text-xs px-2 py-0.5">
              {unreadCount} unread
            </Badge>
          )}
        </div>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            className="text-cyan-600 dark:text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
          >
            Mark all read
          </Button>
        )}
      </div>

      {/* ── Notification list ── */}
      <Card className="overflow-hidden border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-0">
        {loading ? (
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <XCircle className="h-10 w-10 text-red-400 mb-3" />
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchNotifications}
              className="mt-4"
            >
              Try again
            </Button>
          </div>
        ) : !hasAnyNotification ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-400 mb-3" />
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              You&apos;re all set — no notifications
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              We&apos;ll let you know when something needs your attention.
            </p>
          </div>
        ) : (
          <div>
            <NotificationGroup label="Today" notifications={today} onRead={handleRead} />
            <NotificationGroup label="This Week" notifications={thisWeek} onRead={handleRead} />
            <NotificationGroup label="Older" notifications={older} onRead={handleRead} />
          </div>
        )}
      </Card>

      {/* ── Preferences section ── */}
      <div>
        <Separator className="mb-8" />

        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Notification Preferences
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              Choose which events trigger in-app notifications.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleSavePrefs}
            disabled={savingPrefs}
            className="bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            {savingPrefs ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <Card className="border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 divide-y divide-neutral-200 dark:divide-neutral-800">
          <PrefRow
            id="newReport"
            label="New Report"
            description="When a new inspection report is created or assigned to you."
            checked={preferences.newReport}
            onToggle={handlePrefToggle}
          />
          <PrefRow
            id="inspectionComplete"
            label="Inspection Complete"
            description="When an inspection is submitted or marked as complete."
            checked={preferences.inspectionComplete}
            onToggle={handlePrefToggle}
          />
          <PrefRow
            id="paymentReceived"
            label="Payment Received"
            description="When a payment or invoice is settled through an integration."
            checked={preferences.paymentReceived}
            onToggle={handlePrefToggle}
          />
          <PrefRow
            id="syncError"
            label="Sync Error"
            description="When an integration sync to Xero, QBO, ServiceM8 or Ascora fails."
            checked={preferences.syncError}
            onToggle={handlePrefToggle}
          />
          <PrefRow
            id="systemAlert"
            label="System Alert"
            description="Platform-level alerts, maintenance notices, and security events."
            checked={preferences.systemAlert}
            onToggle={handlePrefToggle}
          />
        </Card>
      </div>
    </div>
  )
}
