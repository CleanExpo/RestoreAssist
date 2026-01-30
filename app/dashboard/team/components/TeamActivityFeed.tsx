"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import {
  FileText,
  CheckCircle2,
  UserPlus,
  Mail,
  UserCheck,
  ClipboardList,
  ClipboardCheck,
  Clock,
  Loader2,
  RefreshCw,
  Activity,
  Crown,
  UserCog,
  Wrench,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface ActivityItem {
  id: string
  type: 'report_created' | 'report_completed' | 'member_joined' | 'invite_sent' | 'invite_accepted' | 'inspection_started' | 'inspection_submitted'
  actorName: string
  actorEmail: string
  actorRole: string
  description: string
  timestamp: string
  metadata?: Record<string, any>
}

const activityConfig: Record<ActivityItem['type'], { icon: any; color: string; bgColor: string; label: string }> = {
  report_created: {
    icon: FileText,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    label: "Report",
  },
  report_completed: {
    icon: CheckCircle2,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    label: "Completed",
  },
  member_joined: {
    icon: UserPlus,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    label: "Joined",
  },
  invite_sent: {
    icon: Mail,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    label: "Invite",
  },
  invite_accepted: {
    icon: UserCheck,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    label: "Accepted",
  },
  inspection_started: {
    icon: ClipboardList,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    label: "Inspection",
  },
  inspection_submitted: {
    icon: ClipboardCheck,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    label: "Submitted",
  },
}

const roleIcon: Record<string, any> = {
  ADMIN: Crown,
  MANAGER: UserCog,
  USER: Wrench,
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = now - then

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return new Date(timestamp).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  })
}

export default function TeamActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchActivities = async (pageNum: number, append = false) => {
    try {
      if (pageNum === 1) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      const res = await fetch(`/api/team/activity?page=${pageNum}&limit=15`)
      if (!res.ok) {
        if (res.status === 403) {
          setError("Admin or Manager access required")
          return
        }
        throw new Error("Failed to load activity")
      }

      const data = await res.json()

      if (append) {
        setActivities(prev => [...prev, ...data.activities])
      } else {
        setActivities(data.activities)
      }
      setTotal(data.total)
      setHasMore(data.hasMore)
      setPage(pageNum)
    } catch (err) {
      console.error("Error fetching team activity:", err)
      setError(err instanceof Error ? err.message : "Failed to load activity")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    fetchActivities(1)
  }, [])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-500" />
            <CardTitle className="text-lg">Team Activity</CardTitle>
            {total > 0 && (
              <Badge variant="secondary" className="text-xs">
                {total} events
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchActivities(1)}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
        <p className={cn("text-xs", "text-muted-foreground")}>Recent team actions from the last 30 days</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <Loader2 className="w-6 h-6 text-cyan-500 animate-spin mx-auto" />
              <p className={cn("text-sm", "text-muted-foreground")}>Loading team activity...</p>
            </div>
          </div>
        ) : error ? (
          <div className={cn("p-4 rounded-lg text-sm", "bg-destructive/10 text-destructive")}>
            {error}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Activity className={cn("w-10 h-10 mx-auto", "text-muted-foreground/50")} />
            <div>
              <p className={cn("text-sm font-medium", "text-muted-foreground")}>No recent activity</p>
              <p className={cn("text-xs", "text-muted-foreground/70")}>
                Team activity will appear here as members create reports, start inspections, and join the team.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Activity Timeline */}
            <div className="relative">
              {/* Timeline line */}
              <div className={cn("absolute left-4 top-0 bottom-0 w-px", "bg-border")} />

              {activities.map((activity, idx) => {
                const config = activityConfig[activity.type]
                const Icon = config.icon
                const RoleIcon = roleIcon[activity.actorRole] || Wrench

                return (
                  <div
                    key={activity.id}
                    className={cn(
                      "relative flex items-start gap-3 py-3 pl-0 pr-2 rounded-lg transition-colors",
                      "hover:bg-muted/50"
                    )}
                  >
                    {/* Timeline dot */}
                    <div className={cn("relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center", config.bgColor)}>
                      <Icon className={cn("w-4 h-4", config.color)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-sm font-medium truncate", "text-foreground")}>
                          {activity.actorName}
                        </span>
                        <RoleIcon className={cn("w-3 h-3 flex-shrink-0", "text-muted-foreground")} />
                        <span className={cn("text-sm", "text-muted-foreground")}>
                          {activity.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className={cn("w-3 h-3", "text-muted-foreground/70")} />
                        <span className={cn("text-xs", "text-muted-foreground/70")}>
                          {formatRelativeTime(activity.timestamp)}
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                          {config.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="pt-3 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchActivities(page + 1, true)}
                  disabled={loadingMore}
                  className="text-xs"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load more activity"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
