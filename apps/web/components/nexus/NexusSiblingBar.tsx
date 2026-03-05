"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { X } from "lucide-react"

const DISMISSED_KEY = "nexus-sibling-bar-dismissed"

const siblings = [
  { name: "DisasterRecovery.com.au", href: "https://disasterrecovery.com.au" },
  { name: "CARSI Training", href: "https://carsi.com.au" },
  { name: "NRPG", href: "https://nrpg.com.au" },
  { name: "Unite-Hub", href: "https://unitehub.com.au" },
]

interface NexusSiblingBarProps {
  darkMode?: boolean
}

export function NexusSiblingBar({ darkMode = false }: NexusSiblingBarProps) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(DISMISSED_KEY)
    if (stored !== "true") {
      setDismissed(false)
    }
  }, [])

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem(DISMISSED_KEY, "true")
  }

  if (dismissed) return null

  return (
    <div
      className={`w-full border-b py-2 px-4 text-xs transition-colors ${
        darkMode
          ? "bg-[#1C2E47]/80 border-[#5A6A7B]/30 text-[#C4C8CA]"
          : "bg-[#F4F5F6]/80 border-[#5A6A7B]/20 text-[#5A6A7B]"
      }`}
      style={{
        fontFamily:
          '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-medium shrink-0">Also in the Unite-Group Nexus ecosystem:</span>
          <div className="flex items-center gap-2 flex-wrap">
            {siblings.map((s) => (
              <Link
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                  darkMode
                    ? "bg-[#5A6A7B]/30 text-[#C4C8CA] hover:bg-[#5A6A7B]/50 hover:text-[#F4F5F6]"
                    : "bg-[#5A6A7B]/10 text-[#5A6A7B] hover:bg-[#5A6A7B]/20 hover:text-[#1C2E47]"
                }`}
              >
                {s.name}
              </Link>
            ))}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className={`shrink-0 p-1 rounded transition-colors ${
            darkMode
              ? "hover:bg-[#5A6A7B]/30 text-[#C4C8CA]"
              : "hover:bg-[#5A6A7B]/10 text-[#5A6A7B]"
          }`}
          aria-label="Dismiss ecosystem bar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
