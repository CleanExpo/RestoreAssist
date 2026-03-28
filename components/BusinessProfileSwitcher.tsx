"use client"

import { useState, useEffect } from "react"
import { Building2, ChevronDown, Check, Plus, Settings } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import Link from "next/link"
import toast from "react-hot-toast"

interface BusinessProfile {
  id: string
  name: string
  abn: string | null
  logoUrl: string | null
  isDefault: boolean
}

export function BusinessProfileSwitcher() {
  const [profiles, setProfiles] = useState<BusinessProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    fetchProfiles()
  }, [])

  async function fetchProfiles() {
    try {
      const res = await fetch("/api/business-profiles")
      if (!res.ok) return
      const data = await res.json()
      setProfiles(data.profiles || [])
      setActiveProfileId(data.activeBusinessProfileId || null)
    } catch {
      // Silently fail — user may not have profiles yet
    } finally {
      setLoading(false)
    }
  }

  async function switchProfile(profileId: string) {
    if (profileId === activeProfileId || switching) return
    setSwitching(true)
    try {
      const res = await fetch("/api/business-profiles/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      })
      if (!res.ok) {
        toast.error("Failed to switch business profile")
        return
      }
      setActiveProfileId(profileId)
      toast.success("Switched business profile")
      // Refresh the page to pick up the new session data
      window.location.reload()
    } catch {
      toast.error("Failed to switch business profile")
    } finally {
      setSwitching(false)
    }
  }

  // Don't render if loading or no profiles
  if (loading || profiles.length === 0) return null

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0]

  // Single profile — show static label only
  if (profiles.length === 1) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
        "bg-neutral-100 dark:bg-slate-800",
        "text-neutral-700 dark:text-slate-300"
      )}>
        <Building2 className="h-4 w-4" />
        <span className="max-w-[150px] truncate font-medium">{activeProfile.name}</span>
      </div>
    )
  }

  // Multiple profiles — show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
            "bg-neutral-100 dark:bg-slate-800 hover:bg-neutral-200 dark:hover:bg-slate-700",
            "text-neutral-700 dark:text-slate-300",
            "border border-neutral-200 dark:border-slate-700",
            switching && "opacity-50 cursor-wait"
          )}
          disabled={switching}
        >
          <Building2 className="h-4 w-4" />
          <span className="max-w-[150px] truncate font-medium">{activeProfile.name}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {profiles.map((profile) => (
          <DropdownMenuItem
            key={profile.id}
            onClick={() => switchProfile(profile.id)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-medium truncate">{profile.name}</span>
              {profile.abn && (
                <span className="text-xs text-neutral-500 dark:text-slate-500">
                  ABN: {profile.abn}
                </span>
              )}
            </div>
            {profile.id === activeProfileId && (
              <Check className="h-4 w-4 text-cyan-500 shrink-0 ml-2" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href="/dashboard/settings?tab=business-profiles"
            className="flex items-center gap-2 cursor-pointer"
          >
            <Settings className="h-4 w-4" />
            Manage Profiles
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
