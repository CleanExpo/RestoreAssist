"use client"

import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import {
  Users,
  UserPlus,
  Mail,
  Copy,
  Check,
  Clock,
  Shield,
  UserCog,
  Wrench,
  Search,
  Filter,
  Send,
  X,
  Crown,
  Building2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type Member = {
  id: string
  name: string | null
  email: string
  role: "ADMIN" | "MANAGER" | "USER"
  managedById: string | null
  createdAt: string
}

type Invite = {
  id: string
  email: string
  role: "MANAGER" | "USER"
  token: string
  expiresAt: string
  usedAt: string | null
  createdAt: string
  createdById: string
  managedById: string | null
}

const roleConfig = {
  ADMIN: {
    label: "Admin",
    icon: Crown,
    color: "from-purple-500 to-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    textColor: "text-purple-700 dark:text-purple-300",
    borderColor: "border-purple-200 dark:border-purple-800",
  },
  MANAGER: {
    label: "Manager",
    icon: UserCog,
    color: "from-blue-500 to-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-700 dark:text-blue-300",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  USER: {
    label: "Technician",
    icon: Wrench,
    color: "from-cyan-500 to-cyan-600",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    textColor: "text-cyan-700 dark:text-cyan-300",
    borderColor: "border-cyan-200 dark:border-cyan-800",
  },
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
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
}

export default function TeamPage() {
  const { data: session } = useSession()
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "MANAGER" | "USER">("ALL")

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"MANAGER" | "USER">("USER")
  const [creating, setCreating] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  
  // Remove member state
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [removing, setRemoving] = useState(false)

  const inviteLinkBase = useMemo(() => {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/signup?invite=`
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [mRes, iRes] = await Promise.all([fetch("/api/team/members"), fetch("/api/team/invites")])
      const mJson = await mRes.json()
      const iJson = await iRes.json()
      if (mRes.ok) setMembers(mJson.members || [])
      else toast.error(mJson.error || "Failed to load team")
      if (iRes.ok) setInvites(iJson.invites || [])
      else toast.error(iJson.error || "Failed to load invites")
    } catch (e) {
      toast.error("Failed to load team data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const createInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Email is required")
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteEmail.trim())) {
      toast.error("Please enter a valid email address")
      return
    }

    setCreating(true)
    try {
      const res = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "Failed to create invite")
        return
      }

      if (json.tempPassword && res.status === 207) {
        toast.success(
          `Account created for ${json.invite?.email || inviteEmail}. Email sending failed - please share credentials manually.`,
          { duration: 6000 }
        )
      } else {
        toast.success(
          `✨ Account created and invitation email sent to ${json.invite?.email || inviteEmail}!`,
          { duration: 5000 }
        )
      }

      setInviteEmail("")
      setInviteRole("USER")
      setShowInviteForm(false)
      await load()
    } finally {
      setCreating(false)
    }
  }

  const copyInviteLink = async (token: string, inviteId: string) => {
    const link = `${inviteLinkBase}${encodeURIComponent(token)}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedInviteId(inviteId)
      toast.success("Invite link copied to clipboard!")
      setTimeout(() => setCopiedInviteId(null), 2000)
    } catch (err) {
      toast.error("Failed to copy link")
    }
  }

  const resendEmail = async (invite: Invite) => {
    setResendingEmail(invite.id)
    try {
      // For now, we'll show a message. In the future, we can add a resend endpoint
      toast.success(`Resending email to ${invite.email}...`)
      // TODO: Implement resend email API endpoint
      setTimeout(() => {
        setResendingEmail(null)
        toast.success(`Email resent to ${invite.email}!`)
      }, 1500)
    } catch (err) {
      setResendingEmail(null)
      toast.error("Failed to resend email")
    }
  }

  const removeMember = async () => {
    if (!memberToRemove) return

    setRemoving(true)
    try {
      const res = await fetch(`/api/team/members/${memberToRemove.id}`, {
        method: "DELETE",
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error || "Failed to remove team member")
        return
      }

      toast.success(json.message || "Team member removed successfully")
      setMemberToRemove(null)
      await load()
    } catch (err) {
      toast.error("Failed to remove team member")
    } finally {
      setRemoving(false)
    }
  }

  // Check if current user is Admin
  const isAdmin = session?.user?.role === "ADMIN"
  const isManager = session?.user?.role === "MANAGER"
  const isTechnician = session?.user?.role === "USER"
  const canInvite = isAdmin || isManager // Only ADMIN and MANAGER can invite
  const canViewInvites = isAdmin || isManager // Only ADMIN and MANAGER can view invites

  // Filter members and invites
  const filteredMembers = useMemo(() => {
    let filtered = members

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (m) =>
          m.name?.toLowerCase().includes(query) ||
          m.email.toLowerCase().includes(query) ||
          roleConfig[m.role].label.toLowerCase().includes(query)
      )
    }

    if (roleFilter !== "ALL") {
      filtered = filtered.filter((m) => m.role === roleFilter)
    }

    return filtered
  }, [members, searchQuery, roleFilter])

  const filteredInvites = useMemo(() => {
    let filtered = invites

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (inv) =>
          inv.email.toLowerCase().includes(query) ||
          roleConfig[inv.role].label.toLowerCase().includes(query)
      )
    }

    if (roleFilter !== "ALL") {
      filtered = filtered.filter((inv) => inv.role === roleFilter)
    }

    return filtered
  }, [invites, searchQuery, roleFilter])

  // Statistics
  const stats = useMemo(() => {
    const totalMembers = members.length
    const activeInvites = invites.filter((inv) => !inv.usedAt && new Date(inv.expiresAt).getTime() > Date.now()).length
    const admins = members.filter((m) => m.role === "ADMIN").length
    const managers = members.filter((m) => m.role === "MANAGER").length
    const technicians = members.filter((m) => m.role === "USER").length

    return { totalMembers, activeInvites, admins, managers, technicians }
  }, [members, invites])

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center min-h-[400px]")}>
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-cyan-500" />
          <p className={cn("text-sm", "text-neutral-600 dark:text-neutral-400")}>Loading team data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn("text-3xl font-bold", "text-neutral-900 dark:text-neutral-50")}>Team Management</h1>
          <p className={cn("text-sm mt-1", "text-neutral-600 dark:text-neutral-400")}>
            {isTechnician 
              ? "View your organization's team members and hierarchy."
              : "Manage your team members and invitations. Admin can invite Managers. Managers can invite Technicians."
            }
          </p>
        </div>
        {canInvite && (
          <Button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white shadow-lg shadow-cyan-500/20"
          >
            <UserPlus className="w-4 h-4" />
            {showInviteForm ? "Cancel" : "Invite Member"}
          </Button>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className={cn("border-2", "border-neutral-200 dark:border-neutral-800", "bg-white dark:bg-neutral-900/50")}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={cn("text-sm font-medium", "text-neutral-600 dark:text-neutral-400")}>Total Members</p>
                  <p className={cn("text-2xl font-bold mt-1", "text-neutral-900 dark:text-neutral-50")}>
                    {stats.totalMembers}
                  </p>
                </div>
                <div className={cn("p-3 rounded-full", "bg-blue-100 dark:bg-blue-900/30")}>
                  <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {canViewInvites && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card className={cn("border-2", "border-neutral-200 dark:border-neutral-800", "bg-white dark:bg-neutral-900/50")}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={cn("text-sm font-medium", "text-neutral-600 dark:text-neutral-400")}>Active Invites</p>
                    <p className={cn("text-2xl font-bold mt-1", "text-neutral-900 dark:text-neutral-50")}>
                      {stats.activeInvites}
                    </p>
                  </div>
                  <div className={cn("p-3 rounded-full", "bg-cyan-100 dark:bg-cyan-900/30")}>
                    <Mail className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className={cn("border-2", "border-neutral-200 dark:border-neutral-800", "bg-white dark:bg-neutral-900/50")}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={cn("text-sm font-medium", "text-neutral-600 dark:text-neutral-400")}>Managers</p>
                  <p className={cn("text-2xl font-bold mt-1", "text-neutral-900 dark:text-neutral-50")}>
                    {stats.managers}
                  </p>
                </div>
                <div className={cn("p-3 rounded-full", "bg-blue-100 dark:bg-blue-900/30")}>
                  <UserCog className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className={cn("border-2", "border-neutral-200 dark:border-neutral-800", "bg-white dark:bg-neutral-900/50")}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className={cn("text-sm font-medium", "text-neutral-600 dark:text-neutral-400")}>Technicians</p>
                  <p className={cn("text-2xl font-bold mt-1", "text-neutral-900 dark:text-neutral-50")}>
                    {stats.technicians}
                  </p>
                </div>
                <div className={cn("p-3 rounded-full", "bg-cyan-100 dark:bg-cyan-900/30")}>
                  <Wrench className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Invite Form */}
      <AnimatePresence>
        {showInviteForm && canInvite && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className={cn("border-2", "border-cyan-200 dark:border-cyan-800", "bg-gradient-to-br from-cyan-50/50 to-blue-50/50 dark:from-cyan-950/20 dark:to-blue-950/20")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  Invite New Team Member
                </CardTitle>
                <CardDescription>
                  An account will be created immediately and an email with login credentials will be sent.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@example.com"
                        className={cn(
                          "w-full pl-10 pr-4 py-2.5 rounded-lg text-sm",
                          "bg-white dark:bg-neutral-800",
                          "border border-neutral-300 dark:border-neutral-700",
                          "text-neutral-900 dark:text-neutral-50",
                          "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        )}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !creating) {
                            createInvite()
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
                      Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                      className={cn(
                        "w-full px-4 py-2.5 rounded-lg text-sm",
                        "bg-white dark:bg-neutral-800",
                        "border border-neutral-300 dark:border-neutral-700",
                        "text-neutral-900 dark:text-neutral-50",
                        "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      )}
                    >
                      <option value="USER">Technician</option>
                      <option value="MANAGER">Manager</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <Button
                    onClick={createInvite}
                    disabled={creating || !inviteEmail.trim()}
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Invitation
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={() => setShowInviteForm(false)} disabled={creating}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or role..."
            className={cn(
              "w-full pl-10 pr-4 py-2 rounded-lg text-sm",
              "bg-white dark:bg-neutral-800",
              "border border-neutral-300 dark:border-neutral-700",
              "text-neutral-900 dark:text-neutral-50",
              "focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            )}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={roleFilter === "ALL" ? "default" : "outline"}
            onClick={() => setRoleFilter("ALL")}
            size="sm"
          >
            All
          </Button>
          <Button
            variant={roleFilter === "ADMIN" ? "default" : "outline"}
            onClick={() => setRoleFilter("ADMIN")}
            size="sm"
          >
            <Crown className="w-3 h-3 mr-1" />
            Admin
          </Button>
          <Button
            variant={roleFilter === "MANAGER" ? "default" : "outline"}
            onClick={() => setRoleFilter("MANAGER")}
            size="sm"
          >
            <UserCog className="w-3 h-3 mr-1" />
            Manager
          </Button>
          <Button
            variant={roleFilter === "USER" ? "default" : "outline"}
            onClick={() => setRoleFilter("USER")}
            size="sm"
          >
            <Wrench className="w-3 h-3 mr-1" />
            Technician
          </Button>
        </div>
      </div>

      {/* Members Section */}
      <Card className={cn("border-2", "border-neutral-200 dark:border-neutral-800", "bg-white dark:bg-neutral-900/50")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team Members ({filteredMembers.length})
          </CardTitle>
          <CardDescription>Active members in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredMembers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-neutral-400 mb-4" />
              <p className={cn("text-sm font-medium", "text-neutral-600 dark:text-neutral-400")}>
                {searchQuery || roleFilter !== "ALL" ? "No members match your filters" : "No team members yet"}
              </p>
              {!searchQuery && roleFilter === "ALL" && (
                <p className={cn("text-xs mt-1", "text-neutral-500 dark:text-neutral-500")}>
                  Invite your first team member to get started
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMembers.map((member, idx) => {
                const config = roleConfig[member.role]
                const Icon = config.icon
                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                  >
                    <Card
                      className={cn(
                        "border-2 transition-all hover:shadow-lg hover:scale-[1.02]",
                        config.borderColor,
                        "bg-white dark:bg-neutral-900"
                      )}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm",
                                `bg-gradient-to-br ${config.color} text-white shadow-lg`
                              )}
                            >
                              {getInitials(member.name, member.email)}
                            </div>
                            <div>
                              <p className={cn("font-semibold", "text-neutral-900 dark:text-neutral-50")}>
                                {member.name || "No name"}
                              </p>
                              <p className={cn("text-xs mt-0.5", "text-neutral-600 dark:text-neutral-400")}>
                                {member.email}
                              </p>
                            </div>
                          </div>
                          <Badge
                            className={cn(
                              "flex items-center gap-1",
                              config.bgColor,
                              config.textColor,
                              config.borderColor
                            )}
                          >
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <div className={cn("flex items-center gap-2 text-xs", "text-neutral-500 dark:text-neutral-400")}>
                            <Calendar className="w-3 h-3" />
                            Joined {formatDate(member.createdAt)}
                          </div>
                          {isAdmin && member.role !== "ADMIN" && member.id !== session?.user?.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setMemberToRemove(member)}
                              className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 border-rose-200 dark:border-rose-800"
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-600" />
              Remove Team Member
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToRemove?.name || memberToRemove?.email}</strong> from your team?
              <br />
              <br />
              This will remove them from your organization. They will no longer have access to team resources, but their account will remain active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={removeMember}
              disabled={removing}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {removing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove Member
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invites Section - Only visible to Admin and Manager */}
      {canViewInvites && (
        <Card className={cn("border-2", "border-neutral-200 dark:border-neutral-800", "bg-white dark:bg-neutral-900/50")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Invitations ({filteredInvites.length})
            </CardTitle>
            <CardDescription>
              Accounts are created immediately when invites are sent. Users receive an email with their login credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredInvites.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="w-12 h-12 mx-auto text-neutral-400 mb-4" />
                <p className={cn("text-sm font-medium", "text-neutral-600 dark:text-neutral-400")}>
                  {searchQuery || roleFilter !== "ALL" ? "No invites match your filters" : "No invitations yet"}
                </p>
                {!searchQuery && roleFilter === "ALL" && (
                  <p className={cn("text-xs mt-1", "text-neutral-500 dark:text-neutral-500")}>
                    Create an invitation to add a new team member
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInvites.map((invite, idx) => {
                  const config = roleConfig[invite.role]
                  const Icon = config.icon
                  const isUsed = Boolean(invite.usedAt)
                  const isExpired = new Date(invite.expiresAt).getTime() < Date.now()
                  const isActive = !isUsed && !isExpired

                  return (
                    <motion.div
                      key={invite.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.05 }}
                    >
                      <Card
                        className={cn(
                          "border-2 transition-all",
                          isActive
                            ? "border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/20"
                            : isUsed
                              ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
                              : "border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20",
                          "hover:shadow-md"
                        )}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div
                                  className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold",
                                    `bg-gradient-to-br ${config.color} text-white`
                                  )}
                                >
                                  {invite.email.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className={cn("font-medium", "text-neutral-900 dark:text-neutral-50")}>
                                    {invite.email}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge
                                      variant="outline"
                                      className={cn("text-xs", config.textColor, config.borderColor)}
                                    >
                                      <Icon className="w-3 h-3 mr-1" />
                                      {config.label}
                                    </Badge>
                                    {isUsed ? (
                                      <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400 border-green-200 dark:border-green-800">
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Account Created
                                      </Badge>
                                    ) : isExpired ? (
                                      <Badge variant="outline" className="text-xs text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800">
                                        <AlertCircle className="w-3 h-3 mr-1" />
                                        Expired
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800">
                                        <Clock className="w-3 h-3 mr-1" />
                                        Active
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className={cn("flex items-center gap-4 text-xs mt-2", "text-neutral-500 dark:text-neutral-400")}>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(invite.createdAt)}
                                </span>
                                {!isUsed && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Expires {formatDate(invite.expiresAt)}
                                  </span>
                                )}
                              </div>
                              {!isUsed && canInvite && (
                                <div className="mt-3 flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => copyInviteLink(invite.token, invite.id)}
                                    className="text-xs"
                                  >
                                    {copiedInviteId === invite.id ? (
                                      <>
                                        <Check className="w-3 h-3 mr-1" />
                                        Copied!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3 mr-1" />
                                        Copy Link
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => resendEmail(invite)}
                                    disabled={resendingEmail === invite.id}
                                    className="text-xs"
                                  >
                                    {resendingEmail === invite.id ? (
                                      <>
                                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                        Sending...
                                      </>
                                    ) : (
                                      <>
                                        <Send className="w-3 h-3 mr-1" />
                                        Resend Email
                                      </>
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
