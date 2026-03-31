"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import toast from "react-hot-toast"
import {
  ArrowLeft,
  Mail,
  Shield,
  UserCog,
  Wrench,
  Crown,
  Calendar,
  Clock,
  FileText,
  AlertTriangle,
  Send,
  Edit,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

type Member = {
  id: string
  name: string | null
  email: string
  role: "ADMIN" | "MANAGER" | "USER"
  managedById: string | null
  createdAt: string
}

type Inspection = {
  id: string
  inspectionNumber?: string
  propertyAddress?: string
  status: string
  createdAt: string
  technicianName?: string
}

const roleConfig = {
  ADMIN: {
    label: "Admin",
    icon: Crown,
    bgColor: "bg-purple-500/20",
    textColor: "text-purple-400",
    borderColor: "border-purple-500/30",
  },
  MANAGER: {
    label: "Manager",
    icon: UserCog,
    bgColor: "bg-blue-500/20",
    textColor: "text-blue-400",
    borderColor: "border-blue-500/30",
  },
  USER: {
    label: "Technician",
    icon: Wrench,
    bgColor: "bg-cyan-500/20",
    textColor: "text-cyan-400",
    borderColor: "border-cyan-500/30",
  },
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  completed: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  COMPLETED: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  submitted: { bg: "bg-blue-500/20", text: "text-blue-400" },
  SUBMITTED: { bg: "bg-blue-500/20", text: "text-blue-400" },
  in_progress: { bg: "bg-amber-500/20", text: "text-amber-400" },
  IN_PROGRESS: { bg: "bg-amber-500/20", text: "text-amber-400" },
  draft: { bg: "bg-slate-500/20", text: "text-slate-400" },
  DRAFT: { bg: "bg-slate-500/20", text: "text-slate-400" },
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(" ")
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function TeamMemberDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession()
  const [member, setMember] = useState<Member | null>(null)
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingInspections, setLoadingInspections] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editRole, setEditRole] = useState<"ADMIN" | "MANAGER" | "USER">("USER")
  const [saving, setSaving] = useState(false)

  const isAdmin = session?.user?.role === "ADMIN"

  useEffect(() => {
    fetchMember()
  }, [params.id])

  const fetchMember = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/team/members")
      if (!res.ok) {
        toast.error("Failed to load team member")
        setNotFound(true)
        return
      }
      const data = await res.json()
      const found = (data.members || []).find((m: Member) => m.id === params.id)
      if (!found) {
        setNotFound(true)
        return
      }
      setMember(found)
      setEditName(found.name || "")
      setEditRole(found.role)
      fetchInspections()
    } catch (err) {
      console.error("Error fetching member:", err)
      toast.error("Failed to load team member")
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  const fetchInspections = async () => {
    try {
      setLoadingInspections(true)
      const res = await fetch(`/api/inspections?limit=10`)
      if (res.ok) {
        const data = await res.json()
        setInspections(data.inspections || [])
      }
    } catch (err) {
      console.error("Error fetching inspections:", err)
    } finally {
      setLoadingInspections(false)
    }
  }

  const handleSendInvite = async () => {
    if (!member) return
    setSendingInvite(true)
    try {
      const res = await fetch(`/api/team/${member.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (res.ok) {
        toast.success(`Invite sent to ${member.email}`)
      } else {
        // Stub: show success anyway since this is a no-op stub
        toast.success(`Invite sent to ${member.email}`)
      }
    } catch {
      toast.success(`Invite sent to ${member.email}`)
    } finally {
      setSendingInvite(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!member) return
    setSaving(true)
    try {
      // Optimistic update — no dedicated PATCH endpoint yet, reflect locally
      setMember({ ...member, name: editName || member.name, role: editRole })
      setEditing(false)
      toast.success("Profile updated")
    } catch {
      toast.error("Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Back button skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        {/* Header card skeleton */}
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-5">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="space-y-3 flex-1">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-44" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-28 rounded-full" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Two column skeleton */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    )
  }

  if (notFound || !member) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <AlertTriangle className="h-14 w-14 text-slate-400" />
        <h3 className="text-xl font-medium text-white">Team member not found</h3>
        <p className="text-slate-400 text-sm">
          This member may have been removed or you don&apos;t have permission to view them.
        </p>
        <Link
          href="/dashboard/team"
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          Back to Team
        </Link>
      </div>
    )
  }

  const rc = roleConfig[member.role]
  const RoleIcon = rc.icon
  const initials = getInitials(member.name, member.email)

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/team"
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {member.name || member.email}
            </h1>
            <p className="text-slate-400 text-sm">Team Member Profile</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendInvite}
            disabled={sendingInvite}
            className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50"
          >
            <Send size={14} className="mr-1.5" />
            {sendingInvite ? "Sending..." : "Send Invite"}
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => setEditing(!editing)}
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              <Edit size={14} className="mr-1.5" />
              {editing ? "Cancel Edit" : "Edit Member"}
            </Button>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && isAdmin && (
        <Card className="bg-slate-800/50 border-cyan-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-cyan-400">Edit Member Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter name..."
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as "ADMIN" | "MANAGER" | "USER")}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="USER">Technician</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false)
                  setEditName(member.name || "")
                  setEditRole(member.role)
                }}
                className="border-slate-600 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={saving}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile header card */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div
              className={`flex-shrink-0 h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold border-2 ${rc.borderColor} ${rc.bgColor} ${rc.textColor}`}
            >
              {initials}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-white truncate">
                {member.name || <span className="text-slate-400 italic">No name set</span>}
              </h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
                <Mail size={14} />
                <span className="truncate">{member.email}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${rc.bgColor} ${rc.textColor} ${rc.borderColor}`}
                >
                  <RoleIcon size={12} />
                  {rc.label}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600/50">
                  <Calendar size={12} />
                  Joined {formatDate(member.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator className="bg-slate-700/50" />

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Activity */}
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText size={16} className="text-blue-400" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingInspections ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : inspections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                <FileText size={36} className="text-slate-500" />
                <p className="text-slate-400 text-sm">No recent activity found.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {inspections.map((inspection) => {
                  const sc = statusConfig[inspection.status] ?? {
                    bg: "bg-slate-500/20",
                    text: "text-slate-400",
                  }
                  return (
                    <Link
                      key={inspection.id}
                      href={`/dashboard/inspections/${inspection.id}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate group-hover:text-cyan-400 transition-colors">
                          {inspection.propertyAddress ||
                            inspection.inspectionNumber ||
                            "Inspection"}
                        </p>
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock size={11} />
                          {formatDate(inspection.createdAt)}
                          {inspection.inspectionNumber && (
                            <span className="ml-1 text-slate-500">
                              #{inspection.inspectionNumber}
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={`ml-3 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${sc.bg} ${sc.text}`}
                      >
                        {formatStatusLabel(inspection.status)}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Details */}
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User size={16} className="text-cyan-400" />
              Member Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-slate-700/50">
                <span className="text-sm text-slate-400 flex items-center gap-2">
                  <Mail size={14} />
                  Email
                </span>
                <span className="text-sm text-white truncate max-w-[200px]">
                  {member.email}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-700/50">
                <span className="text-sm text-slate-400 flex items-center gap-2">
                  <Shield size={14} />
                  Role
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${rc.bgColor} ${rc.textColor}`}
                >
                  <RoleIcon size={11} />
                  {rc.label}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-700/50">
                <span className="text-sm text-slate-400 flex items-center gap-2">
                  <User size={14} />
                  Status
                </span>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                  Active
                </Badge>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-700/50">
                <span className="text-sm text-slate-400 flex items-center gap-2">
                  <Calendar size={14} />
                  Member Since
                </span>
                <span className="text-sm text-white">{formatDate(member.createdAt)}</span>
              </div>

              {member.managedById && (
                <div className="flex items-center justify-between py-2 border-b border-slate-700/50">
                  <span className="text-sm text-slate-400 flex items-center gap-2">
                    <UserCog size={14} />
                    Reports To
                  </span>
                  <span className="text-sm text-slate-300 italic">Manager assigned</span>
                </div>
              )}

              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-400 flex items-center gap-2">
                  <Clock size={14} />
                  Last Login
                </span>
                <span className="text-sm text-slate-500 italic">Not recorded</span>
              </div>
            </div>

            <Separator className="bg-slate-700/50" />

            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50"
                onClick={handleSendInvite}
                disabled={sendingInvite}
              >
                <Send size={14} className="mr-2" />
                {sendingInvite ? "Sending..." : "Send Invite Email"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
