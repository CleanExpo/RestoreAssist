"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { MapPin, Loader2, Search, X, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ParsedAddress {
  fullAddress: string    // "123 Main St, Suburb NSW 2000"
  streetNumber?: string
  streetName?: string
  suburb?: string
  state?: string         // "NSW", "VIC", etc.
  postcode?: string
}

interface NominatimResult {
  place_id: number
  display_name: string
  address: {
    house_number?: string
    road?: string
    suburb?: string
    city?: string
    town?: string
    village?: string
    hamlet?: string
    state?: string
    postcode?: string
    country_code?: string
  }
}

interface AustralianAddressSearchProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (parsed: ParsedAddress) => void
  placeholder?: string
  required?: boolean
  className?: string
  disabled?: boolean
}

const AU_STATE_ABBR: Record<string, string> = {
  "New South Wales": "NSW",
  "Victoria": "VIC",
  "Queensland": "QLD",
  "South Australia": "SA",
  "Western Australia": "WA",
  "Tasmania": "TAS",
  "Northern Territory": "NT",
  "Australian Capital Territory": "ACT",
}

function parseNominatimResult(result: NominatimResult): ParsedAddress {
  const a = result.address
  const suburb = a.suburb ?? a.city ?? a.town ?? a.village ?? a.hamlet ?? ""
  const stateRaw = a.state ?? ""
  const state = AU_STATE_ABBR[stateRaw] ?? stateRaw
  const postcode = a.postcode ?? ""

  // Build clean address string
  const parts: string[] = []
  if (a.house_number) parts.push(a.house_number)
  if (a.road) parts.push(a.road)
  const street = parts.join(" ")

  const fullParts: string[] = []
  if (street) fullParts.push(street)
  if (suburb) fullParts.push(suburb)
  if (state) fullParts.push(state)
  if (postcode) fullParts.push(postcode)

  return {
    fullAddress: fullParts.join(" "),
    streetNumber: a.house_number,
    streetName: a.road,
    suburb,
    state,
    postcode,
  }
}

function formatSuggestion(result: NominatimResult): string {
  const parsed = parseNominatimResult(result)
  const parts: string[] = []
  if (parsed.streetNumber || parsed.streetName) {
    parts.push([parsed.streetNumber, parsed.streetName].filter(Boolean).join(" "))
  }
  if (parsed.suburb) parts.push(parsed.suburb)
  if (parsed.state) parts.push(parsed.state)
  if (parsed.postcode) parts.push(parsed.postcode)
  return parts.join(", ")
}

export function AustralianAddressSearch({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address…",
  required,
  className,
  disabled,
}: AustralianAddressSearchProps) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 4) {
      setSuggestions([])
      setOpen(false)
      return
    }

    // Cancel previous request
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search")
      url.searchParams.set("q", `${query}, Australia`)
      url.searchParams.set("countrycodes", "au")
      url.searchParams.set("format", "json")
      url.searchParams.set("addressdetails", "1")
      url.searchParams.set("limit", "6")

      const res = await fetch(url.toString(), {
        headers: { "Accept-Language": "en-AU", "User-Agent": "RestoreAssist/2.0" },
        signal: abortRef.current.signal,
      })

      if (!res.ok) throw new Error("Nominatim error")
      const data: NominatimResult[] = await res.json()

      // Filter to AU only, prefer street-level results
      const filtered = data.filter(r => r.address.country_code === "au")
      setSuggestions(filtered)
      setOpen(filtered.length > 0)
      setActiveIdx(-1)
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setSuggestions([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    onChange(v)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 420)
  }

  const handleSelect = (result: NominatimResult) => {
    const parsed = parseNominatimResult(result)
    const label = formatSuggestion(result)
    onChange(label)
    onSelect?.(parsed)
    setSuggestions([])
    setOpen(false)
    setActiveIdx(-1)
    inputRef.current?.blur()
  }

  const handleClear = () => {
    onChange("")
    setSuggestions([])
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault()
      handleSelect(suggestions[activeIdx])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()
  }, [])

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <MapPin
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-slate-500 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          required={required}
          disabled={disabled}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            "w-full pl-9 pr-9 py-2 rounded-lg text-sm",
            "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
            "text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-slate-500",
            "focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 size={14} className="animate-spin text-neutral-400" />}
          {!loading && value && (
            <button
              type="button"
              onClick={handleClear}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-slate-300 transition-colors"
              tabIndex={-1}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg shadow-black/10 overflow-hidden">
          {suggestions.map((result, idx) => {
            const label = formatSuggestion(result)
            const parsed = parseNominatimResult(result)
            const isActive = idx === activeIdx

            return (
              <button
                key={result.place_id}
                type="button"
                onMouseDown={e => { e.preventDefault(); handleSelect(result) }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={cn(
                  "w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors text-sm",
                  isActive
                    ? "bg-cyan-50 dark:bg-cyan-900/20"
                    : "hover:bg-neutral-50 dark:hover:bg-slate-700/50"
                )}
              >
                <MapPin
                  size={14}
                  className="flex-shrink-0 mt-0.5 text-cyan-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-900 dark:text-white truncate">{label}</p>
                  {parsed.suburb && parsed.state && (
                    <p className="text-xs text-neutral-400 dark:text-slate-500 mt-0.5">
                      {parsed.suburb}, {parsed.state}
                      {parsed.postcode && ` ${parsed.postcode}`}
                    </p>
                  )}
                </div>
                {isActive && <ChevronRight size={14} className="flex-shrink-0 mt-0.5 text-cyan-500" />}
              </button>
            )
          })}
          <div className="px-3 py-1.5 border-t border-neutral-100 dark:border-slate-700/50 text-xs text-neutral-400 dark:text-slate-500">
            Address data © OpenStreetMap contributors
          </div>
        </div>
      )}
    </div>
  )
}
