"use client"

import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"

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

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"MANAGER" | "USER">("USER")
  const [creating, setCreating] = useState(false)

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
      toast.success("Invite created")
      setInviteEmail("")
      setInviteRole("USER")
      await load()
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-neutral-800", "bg-white dark:bg-neutral-900/50")}>
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn("text-2xl font-semibold", "text-neutral-900 dark:text-neutral-50")}>Team</h1>
        <p className={cn("text-sm mt-1", "text-neutral-600 dark:text-neutral-400")}>
          Admin can invite Managers. Managers can invite Technicians.
        </p>
      </div>

      <div className={cn("p-6 rounded-lg border space-y-4", "border-neutral-200 dark:border-neutral-800", "bg-white dark:bg-neutral-900/50")}>
        <h2 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-neutral-50")}>Invite someone</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@example.com"
            className={cn(
              "w-full px-3 py-2 rounded-lg text-sm",
              "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
              "text-neutral-900 dark:text-neutral-50"
            )}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as any)}
            className={cn(
              "w-full px-3 py-2 rounded-lg text-sm",
              "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
              "text-neutral-900 dark:text-neutral-50"
            )}
          >
            <option value="USER">Technician</option>
            <option value="MANAGER">Manager</option>
          </select>
          <button
            type="button"
            onClick={createInvite}
            disabled={creating}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium",
              "bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50",
              "text-white"
            )}
          >
            {creating ? "Creating..." : "Create invite"}
          </button>
        </div>
      </div>

      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-neutral-800", "bg-white dark:bg-neutral-900/50")}>
        <h2 className={cn("text-lg font-semibold mb-4", "text-neutral-900 dark:text-neutral-50")}>Members</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex items-center justify-between rounded-lg border px-4 py-3",
                "border-neutral-200 dark:border-neutral-800",
                "bg-white dark:bg-neutral-900"
              )}
            >
              <div>
                <div className={cn("text-sm font-medium", "text-neutral-900 dark:text-neutral-50")}>
                  {m.name || "—"} <span className={cn("text-xs ml-2", "text-neutral-600 dark:text-neutral-400")}>{m.email}</span>
                </div>
              </div>
              <div className={cn("text-xs px-2 py-1 rounded", "bg-neutral-100 dark:bg-neutral-800", "text-neutral-700 dark:text-neutral-300")}>
                {m.role === "USER" ? "TECHNICIAN" : m.role}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-neutral-800", "bg-white dark:bg-neutral-900/50")}>
        <h2 className={cn("text-lg font-semibold mb-4", "text-neutral-900 dark:text-neutral-50")}>Invites</h2>
        <div className="space-y-2">
          {invites.map((inv) => {
            const link = `${inviteLinkBase}${encodeURIComponent(inv.token)}`
            const isUsed = Boolean(inv.usedAt)
            const isExpired = new Date(inv.expiresAt).getTime() < Date.now()
            return (
              <div
                key={inv.id}
                className={cn(
                  "rounded-lg border px-4 py-3 space-y-2",
                  "border-neutral-200 dark:border-neutral-800",
                  "bg-white dark:bg-neutral-900"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={cn("text-sm", "text-neutral-900 dark:text-neutral-50")}>
                    {inv.email} —{" "}
                    <span className={cn("text-xs", "text-neutral-600 dark:text-neutral-400")}>
                      {inv.role === "USER" ? "TECHNICIAN" : inv.role}
                    </span>
                  </div>
                  <div className={cn("text-xs", isUsed ? "text-green-600 dark:text-green-400" : isExpired ? "text-rose-600 dark:text-rose-400" : "text-neutral-600 dark:text-neutral-400")}>
                    {isUsed ? "Used" : isExpired ? "Expired" : "Active"}
                  </div>
                </div>
                <div className={cn("text-xs break-all", "text-neutral-700 dark:text-neutral-300")}>{link}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

