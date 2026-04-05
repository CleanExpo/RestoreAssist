"use client"

/**
 * RA-417: Media Asset Catalog — /dashboard/media
 *
 * Filterable, paginated grid/list view of all MediaAsset records in the workspace.
 * Filtering dimensions: job, room, damage type, date range, technician, device, location.
 */

import { useState, useEffect, useCallback } from "react"
import {
  Camera,
  Search,
  Filter,
  Grid3X3,
  List,
  MapPin,
  Calendar,
  Smartphone,
  User,
  Tag,
  ChevronDown,
  Loader2,
  X,
  ImageOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface MediaTag {
  category: string
  value: string
}

interface MediaAsset {
  id: string
  originalFilename: string
  mimeType: string
  fileSize: number
  storagePath: string
  latitude: number | null
  longitude: number | null
  capturedAt: string | null
  deviceMake: string | null
  deviceModel: string | null
  width: number | null
  height: number | null
  inspectionId: string | null
  inspection: {
    inspectionNumber: string
    propertyAddress: string
    propertyPostcode: string
  } | null
  tags: MediaTag[]
}

interface MediaResponse {
  data: MediaAsset[]
  nextCursor: string | null
  total: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getTagValue(tags: MediaTag[], category: string): string | undefined {
  return tags.find((t) => t.category === category)?.value
}

// ── Filters component ─────────────────────────────────────────────────────────

interface FilterState {
  job: string
  room: string
  type: string
  technician: string
  device: string
  location: string
  from: string
  to: string
}

const EMPTY_FILTERS: FilterState = {
  job: "",
  room: "",
  type: "",
  technician: "",
  device: "",
  location: "",
  from: "",
  to: "",
}

function buildQueryString(filters: FilterState, cursor?: string, take = 50): string {
  const params = new URLSearchParams()
  if (filters.job) params.set("job", filters.job)
  if (filters.room) params.set("room", filters.room)
  if (filters.type) params.set("type", filters.type)
  if (filters.technician) params.set("technician", filters.technician)
  if (filters.device) params.set("device", filters.device)
  if (filters.location) params.set("location", filters.location)
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (cursor) params.set("cursor", cursor)
  params.set("take", String(take))
  return params.toString()
}

function activeFilterCount(filters: FilterState): number {
  return Object.values(filters).filter(Boolean).length
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MediaPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [pendingFilters, setPendingFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)

  const fetchAssets = useCallback(
    async (appliedFilters: FilterState, cursor?: string) => {
      if (cursor) {
        setLoadingMore(true)
      } else {
        setLoading(true)
        setAssets([])
      }

      try {
        const qs = buildQueryString(appliedFilters, cursor)
        const res = await fetch(`/api/media?${qs}`)
        if (!res.ok) throw new Error("Failed to fetch media")
        const json: MediaResponse = await res.json()

        setAssets((prev) => (cursor ? [...prev, ...json.data] : json.data))
        setNextCursor(json.nextCursor)
      } catch {
        // silent — empty state handles it
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchAssets(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyFilters = () => {
    setFilters(pendingFilters)
    setFilterOpen(false)
    fetchAssets(pendingFilters)
  }

  const clearFilters = () => {
    const empty = EMPTY_FILTERS
    setPendingFilters(empty)
    setFilters(empty)
    setFilterOpen(false)
    fetchAssets(empty)
  }

  const loadMore = () => {
    if (nextCursor) fetchAssets(filters, nextCursor)
  }

  const activeCount = activeFilterCount(filters)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Camera className="h-6 w-6 text-[#8A6B4E]" />
            <div>
              <h1 className="text-xl font-semibold text-foreground">Media Library</h1>
              <p className="text-xs text-muted-foreground">
                All inspection photos and media assets
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter button */}
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-5 rounded-full px-1.5 text-xs bg-[#8A6B4E] text-white"
                    >
                      {activeCount}
                    </Badge>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Filter Media</p>
                    {activeFilterCount(pendingFilters) > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground"
                        onClick={() => setPendingFilters(EMPTY_FILTERS)}
                      >
                        Clear all
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Job (inspection ID)</Label>
                      <Input
                        placeholder="e.g. clxyz123..."
                        value={pendingFilters.job}
                        onChange={(e) =>
                          setPendingFilters((p) => ({ ...p, job: e.target.value }))
                        }
                        className="h-8 text-sm mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">Room</Label>
                      <Input
                        placeholder="e.g. Kitchen"
                        value={pendingFilters.room}
                        onChange={(e) =>
                          setPendingFilters((p) => ({ ...p, room: e.target.value }))
                        }
                        className="h-8 text-sm mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">Damage Type</Label>
                      <Input
                        placeholder="e.g. Photo: Damage"
                        value={pendingFilters.type}
                        onChange={(e) =>
                          setPendingFilters((p) => ({ ...p, type: e.target.value }))
                        }
                        className="h-8 text-sm mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">Technician</Label>
                      <Input
                        placeholder="Name"
                        value={pendingFilters.technician}
                        onChange={(e) =>
                          setPendingFilters((p) => ({ ...p, technician: e.target.value }))
                        }
                        className="h-8 text-sm mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">Device</Label>
                      <Input
                        placeholder="e.g. iPhone, Samsung"
                        value={pendingFilters.device}
                        onChange={(e) =>
                          setPendingFilters((p) => ({ ...p, device: e.target.value }))
                        }
                        className="h-8 text-sm mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">Postcode</Label>
                      <Input
                        placeholder="e.g. 3000"
                        value={pendingFilters.location}
                        onChange={(e) =>
                          setPendingFilters((p) => ({ ...p, location: e.target.value }))
                        }
                        className="h-8 text-sm mt-1"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">From date</Label>
                        <Input
                          type="date"
                          value={pendingFilters.from}
                          onChange={(e) =>
                            setPendingFilters((p) => ({ ...p, from: e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">To date</Label>
                        <Input
                          type="date"
                          value={pendingFilters.to}
                          onChange={(e) =>
                            setPendingFilters((p) => ({ ...p, to: e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="flex-1 bg-[#1C2E47] hover:bg-[#1C2E47]/90"
                      onClick={applyFilters}
                    >
                      Apply Filters
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilterOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Clear active filters */}
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}

            {/* View toggle */}
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                className={cn(
                  "px-2.5 py-1.5 transition-colors",
                  viewMode === "grid"
                    ? "bg-[#1C2E47] text-white"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                className={cn(
                  "px-2.5 py-1.5 transition-colors",
                  viewMode === "list"
                    ? "bg-[#1C2E47] text-white"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
                onClick={() => setViewMode("list")}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Active filter badges */}
        {activeCount > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {Object.entries(filters).map(([key, value]) =>
              value ? (
                <Badge
                  key={key}
                  variant="secondary"
                  className="gap-1 text-xs font-normal"
                >
                  <span className="text-muted-foreground capitalize">{key}:</span>
                  {value}
                </Badge>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <EmptyState hasFilters={activeCount > 0} onClear={clearFilters} />
        ) : viewMode === "grid" ? (
          <GridView assets={assets} />
        ) : (
          <ListView assets={assets} />
        )}

        {/* Load more */}
        {!loading && nextCursor && (
          <div className="flex justify-center mt-6">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={loadingMore}
              className="gap-2"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Grid View ─────────────────────────────────────────────────────────────────

function GridView({ assets }: { assets: MediaAsset[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {assets.map((asset) => (
        <AssetCard key={asset.id} asset={asset} />
      ))}
    </div>
  )
}

function AssetCard({ asset }: { asset: MediaAsset }) {
  const room = getTagValue(asset.tags, "room")
  const damageType = getTagValue(asset.tags, "damage_type")
  const isImage = asset.mimeType.startsWith("image/")

  return (
    <Card className="group overflow-hidden hover:shadow-md transition-shadow cursor-pointer border-border/60">
      {/* Thumbnail */}
      <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/storage/thumbnail?path=${encodeURIComponent(asset.storagePath)}`}
            alt={asset.originalFilename}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement
              el.style.display = "none"
              el.nextElementSibling?.classList.remove("hidden")
            }}
          />
        ) : null}
        <div className={cn("flex items-center justify-center", isImage ? "hidden" : "")}>
          <ImageOff className="h-8 w-8 text-muted-foreground/40" />
        </div>
      </div>

      <CardContent className="p-2 space-y-1">
        {/* Filename */}
        <p
          className="text-xs font-medium truncate text-foreground"
          title={asset.originalFilename}
        >
          {asset.originalFilename}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {asset.capturedAt && (
            <span>{new Date(asset.capturedAt).toLocaleDateString("en-AU")}</span>
          )}
          {asset.inspection?.propertyPostcode && (
            <>
              <span>·</span>
              <MapPin className="h-2.5 w-2.5" />
              <span>{asset.inspection.propertyPostcode}</span>
            </>
          )}
        </div>

        {/* Tags */}
        {(room || damageType) && (
          <div className="flex flex-wrap gap-1">
            {room && (
              <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                {room}
              </span>
            )}
            {damageType && (
              <span className="rounded bg-[#8A6B4E]/10 px-1 py-0.5 text-[9px] text-[#8A6B4E]">
                {damageType}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── List View ─────────────────────────────────────────────────────────────────

function ListView({ assets }: { assets: MediaAsset[] }) {
  return (
    <div className="space-y-1">
      {assets.map((asset) => (
        <AssetRow key={asset.id} asset={asset} />
      ))}
    </div>
  )
}

function AssetRow({ asset }: { asset: MediaAsset }) {
  const room = getTagValue(asset.tags, "room")
  const damageType = getTagValue(asset.tags, "damage_type")
  const technician = getTagValue(asset.tags, "technician")
  const device = getTagValue(asset.tags, "device")

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-card px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
      {/* Icon */}
      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
        <Camera className="h-5 w-5 text-muted-foreground/60" />
      </div>

      {/* Filename + inspection */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-foreground">{asset.originalFilename}</p>
        {asset.inspection && (
          <p className="text-xs text-muted-foreground truncate">
            {asset.inspection.inspectionNumber} · {asset.inspection.propertyAddress}
          </p>
        )}
      </div>

      {/* Tags */}
      <div className="hidden sm:flex items-center gap-1.5">
        {room && (
          <Badge variant="secondary" className="text-xs font-normal">
            {room}
          </Badge>
        )}
        {damageType && (
          <Badge
            variant="outline"
            className="text-xs font-normal border-[#8A6B4E]/30 text-[#8A6B4E]"
          >
            {damageType}
          </Badge>
        )}
      </div>

      {/* Device */}
      {device && (
        <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5" />
          <span className="truncate max-w-24">{device}</span>
        </div>
      )}

      {/* Technician */}
      {technician && (
        <div className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          <span className="truncate max-w-24">{technician}</span>
        </div>
      )}

      {/* Date + size */}
      <div className="text-right flex-shrink-0">
        {asset.capturedAt && (
          <p className="text-xs text-muted-foreground">
            {new Date(asset.capturedAt).toLocaleDateString("en-AU")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{formatBytes(asset.fileSize)}</p>
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean
  onClear: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <Camera className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <h3 className="text-sm font-medium text-foreground mb-1">
        {hasFilters ? "No media matches your filters" : "No media assets yet"}
      </h3>
      <p className="text-xs text-muted-foreground max-w-sm">
        {hasFilters
          ? "Try adjusting or clearing your filters to see more results."
          : "Media assets are automatically cataloged when photos are uploaded to inspections."}
      </p>
      {hasFilters && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
