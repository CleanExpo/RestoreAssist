"use client"

import { useEffect, useState, useCallback } from "react"
import { Bell, CheckCircle, AlertTriangle, Info, CheckCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface Notification {
  id: string
  title: string
  message: string
  type: "info" | "success" | "warning" | "error"
  read: boolean
  createdAt: string
}

type DateGroup = "Today" | "Yesterday" | "Earlier"

function getDateGroup(dateStr: string): DateGroup {
  const date = new Date(dateStr)
  const now = new Date()

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  if (date >= todayStart) return "Today"
  if (date >= yesterdayStart) return "Yesterday"
  return "Earlier"
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`
  if (diffDays === 1) {
    const h = date.getHours()
    const ampm = h >= 12 ? "pm" : "am"
    const hour = h % 12 || 12
    return `Yesterday at ${hour}${ampm}`
  }
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

function NotificationIcon({ type }: { type: Notification["type"] }) {
  const iconProps = { size: 18, strokeWidth: 2 }
  switch (type) {
    case "success":
      return <CheckCircle {...iconProps} className="text-emerald-400" />
    case "warning":
      return <AlertTriangle {...iconProps} className="text-amber-400" />
    case "error":
      return <AlertTriangle {...iconProps} className="text-red-400" />
    default:
      return <Info {...iconProps} className="text-cyan-400" />
  }
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: Notification
  onMarkRead: (id: string) => void
}) {
  const [marking, setMarking] = useState(false)

  const handleMarkRead = async () => {
    if (notification.read) return
    setMarking(true)
    try {
      await fetch(`/api/notifications/${notification.id}/read`, {
        method: "POST",
      })
      onMarkRead(notification.id)
    } catch {
      // Silently fail — UI optimism already applied by parent
    } finally {
      setMarking(false)
    }
  }

  return (
    <div
      className={cn(
        "flex items-start gap-4 px-4 py-3 rounded-lg transition-colors relative",
        !notification.read
          ? "bg-slate-800/70 border-l-2 border-cyan-500"
          : "bg-slate-800/30 border-l-2 border-transparent"
      )}
    >
      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        <NotificationIcon type={notification.type} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm leading-snug",
            !notification.read ? "font-semibold text-white" : "font-normal text-slate-300"
          )}
        >
          {notification.title}
        </p>
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{notification.message}</p>
        <p className="text-xs text-slate-500 mt-1">{formatRelativeTime(notification.createdAt)}</p>
      </div>

      {/* Mark read button */}
      {!notification.read && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkRead}
          disabled={marking}
          className="shrink-0 h-7 text-xs border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white bg-transparent"
        >
          {marking ? "..." : "Mark read"}
        </Button>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-4 px-4 py-3">
          <Skeleton className="h-5 w-5 rounded-full bg-slate-700 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 bg-slate-700" />
            <Skeleton className="h-3 w-full bg-slate-700" />
            <Skeleton className="h-3 w-1/4 bg-slate-700" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/notifications")
      const data = await res.json()
      if (data.notifications) {
        setNotifications(data.notifications)
      }
    } catch {
      // Leave empty on error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleMarkRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }, [])

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      await fetch("/api/notifications/read-all", { method: "POST" })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      // Silently fail
    } finally {
      setMarkingAll(false)
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  // Group by date
  const groups: Record<DateGroup, Notification[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  }
  for (const n of notifications) {
    groups[getDateGroup(n.createdAt)].push(n)
  }
  const groupOrder: DateGroup[] = ["Today", "Yesterday", "Earlier"]

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Notifications</h1>
            {unreadCount > 0 && (
              <Badge className="bg-cyan-500 text-white hover:bg-cyan-600 text-xs px-2 py-0.5">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white bg-transparent flex items-center gap-2"
            >
              <CheckCheck size={15} />
              {markingAll ? "Marking..." : "Mark all read"}
            </Button>
          )}
        </div>

        {/* Content */}
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            {loading ? (
              <LoadingSkeleton />
            ) : notifications.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="rounded-full bg-slate-700 p-4">
                  <Bell size={28} className="text-slate-400" />
                </div>
                <p className="text-white font-medium">You&apos;re all caught up!</p>
                <p className="text-slate-400 text-sm">No notifications yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupOrder.map((group) => {
                  const items = groups[group]
                  if (items.length === 0) return null
                  return (
                    <div key={group}>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                        {group}
                      </p>
                      <div className="space-y-1.5">
                        {items.map((n) => (
                          <NotificationRow
                            key={n.id}
                            notification={n}
                            onMarkRead={handleMarkRead}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
