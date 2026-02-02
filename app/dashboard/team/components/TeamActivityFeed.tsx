"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
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
  Edit3,
  MessageCircle,
  Filter,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export type ActivityType =
  | 'report_created'
  | 'report_updated'
  | 'report_completed'
  | 'member_joined'
  | 'invite_sent'
  | 'invite_accepted'
  | 'inspection_started'
  | 'inspection_submitted'
  | 'interview_completed'

export interface ActivityItem {
  id: string
  type: ActivityType
  actorId: string
  actorName: string
  actorEmail: string
  actorRole: string
  description: string
  timestamp: string
  metadata?: Record<string, unknown>
}

interface TeamMemberOption {
  id: string
  name: string | null
  email: string
  role: string
}

const activityConfig: Record<ActivityType, { icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string; label: string }> = {
  report_created: {
    icon: FileText,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    label: "Report",
  },
  report_updated: {
    icon: Edit3,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    label: "Updated",
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
  interview_completed: {
    icon: MessageCircle,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    label: "Interview",
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

const DATE_RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
]

const ROLE_FILTER_OPTIONS = [
  { value: "ALL", label: "All roles" },
  { value: "MANAGER", label: "Managers" },
  { value: "USER", label: "Technicians" },
]

const ACTIVITY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  { value: "report_created", label: "Report created" },
  { value: "report_updated", label: "Report updated" },
  { value: "report_completed", label: "Report completed" },
  { value: "inspection_started", label: "Inspection started" },
  { value: "inspection_submitted", label: "Inspection submitted" },
  { value: "interview_completed", label: "Interview completed" },
  { value: "invite_sent", label: "Invite sent" },
  { value: "invite_accepted", label: "Invite accepted" },
  { value: "member_joined", label: "Member joined" },
]

export default function TeamActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [members, setMembers] = useState<TeamMemberOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [dateRange, setDateRange] = useState("30")
  const [roleFilter, setRoleFilter] = useState("ALL")
  const [userId, setUserId] = useState("")
  const [activityType, setActivityType] = useState("")
  const [showFilters, setShowFilters] = useState(false)

  const fetchActivities = useCallback(async (pageNum: number, append = false) => {
    try {
      if (pageNum === 1) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      const params = new URLSearchParams()
      params.set("page", String(pageNum))
      params.set("limit", "25")
      params.set("dateRange", dateRange)
      if (roleFilter !== "ALL") params.set("roleFilter", roleFilter)
      if (userId) params.set("userId", userId)
      if (activityType) params.set("activityType", activityType)

      const res = await fetch(`/api/team/activity?${params.toString()}`)
      if (!res.ok) {
        if (res.status === 403) {
          setError("Admin or Manager access required")
          return
        }
        throw new Error("Failed to load activity")
      }

      const data = await res.json()

      if (append) {
        setActivities(prev => [...prev, ...(data.activities || [])])
      } else {
        setActivities(data.activities || [])
      }
      setTotal(data.total ?? 0)
      setHasMore(data.hasMore ?? false)
      setPage(pageNum)
      if (data.members && !append) setMembers(data.members)
    } catch (err) {
      console.error("Error fetching team activity:", err)
      setError(err instanceof Error ? err.message : "Failed to load activity")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [dateRange, roleFilter, userId, activityType])

  useEffect(() => {
    fetchActivities(1)
  }, [fetchActivities])

  const hasActiveFilters = roleFilter !== "ALL" || !!userId || !!activityType
  const dateLabel = DATE_RANGE_OPTIONS.find(d => d.value === dateRange)?.label ?? `Last ${dateRange} days`

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-500" />
            <CardTitle className="text-lg">Team Activity</CardTitle>
            {total > 0 && (
              <Badge variant="secondary" className="text-xs">
                {total} events
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="text-xs"
            >
              <Filter className="w-3.5 h-3.5 mr-1" />
              Filters
              {hasActiveFilters && <Badge variant="default" className="ml-1 h-4 px-1 text-[10px]">On</Badge>}
            </Button>
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
        </div>
        <p className={cn("text-xs", "text-muted-foreground")}>
          {dateLabel}
          {hasActiveFilters && " · Filters applied"}
        </p>
        {showFilters && (
          <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 mt-3 border-t", "border-border")}>
            <div>
              <label className={cn("text-xs font-medium", "text-muted-foreground")}>Date range</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className={cn("mt-1 w-full rounded-md border px-2 py-1.5 text-sm", "bg-background border-input")}
              >
                {DATE_RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={cn("text-xs font-medium", "text-muted-foreground")}>Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className={cn("mt-1 w-full rounded-md border px-2 py-1.5 text-sm", "bg-background border-input")}
              >
                {ROLE_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={cn("text-xs font-medium", "text-muted-foreground")}>Member</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className={cn("mt-1 w-full rounded-md border px-2 py-1.5 text-sm", "bg-background border-input")}
              >
                <option value="">All members</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={cn("text-xs font-medium", "text-muted-foreground")}>Activity type</label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className={cn("mt-1 w-full rounded-md border px-2 py-1.5 text-sm", "bg-background border-input")}
              >
                {ACTIVITY_TYPE_OPTIONS.map((o) => (
                  <option key={o.value || "all"} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
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
                const Icon = config?.icon ?? FileText
                const RoleIcon = roleIcon[activity.actorRole] || Wrench
                const reportId = activity.metadata?.reportId as string | undefined
                const inspectionId = activity.metadata?.inspectionId as string | undefined
                const reportLink = reportId ? `/dashboard/reports/${reportId}` : null
                const inspectionLink = inspectionId ? `/dashboard/inspections/${inspectionId}` : null
                const contentLink = reportLink || inspectionLink

                return (
                  <div
                    key={activity.id}
                    className={cn(
                      "relative flex items-start gap-3 py-3 pl-0 pr-2 rounded-lg transition-colors",
                      "hover:bg-muted/50"
                    )}
                  >
                    <div className={cn("relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center", config?.bgColor ?? "bg-muted")}>
                      <Icon className={cn("w-4 h-4", config?.color ?? "text-muted-foreground")} />
                    </div>

                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-sm font-medium truncate", "text-foreground")}>
                          {activity.actorName}
                        </span>
                        <RoleIcon className={cn("w-3 h-3 flex-shrink-0", "text-muted-foreground")} />
                        {contentLink ? (
                          <Link
                            href={contentLink}
                            className={cn("text-sm hover:underline", "text-primary")}
                          >
                            {activity.description}
                          </Link>
                        ) : (
                          <span className={cn("text-sm", "text-muted-foreground")}>
                            {activity.description}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className={cn("w-3 h-3", "text-muted-foreground/70")} />
                        <span className={cn("text-xs", "text-muted-foreground/70")}>
                          {formatRelativeTime(activity.timestamp)}
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                          {config?.label ?? activity.type}
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
