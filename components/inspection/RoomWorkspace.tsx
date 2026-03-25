'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Camera,
  Droplets,
  ClipboardList,
  LayoutGrid,
  BedDouble, BedSingle, Bath, ShowerHead, CookingPot,
  Sofa, Tv, Utensils, Shirt, DoorOpen, Car,
  Triangle, ArrowDownToLine, MoveHorizontal, Monitor,
  BookOpen, Trees, Home, Layers, Footprints, Square,
  Upload, ArrowLeftRight, Loader2, Plus, CheckSquare,
  X, ZoomIn, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Room, RoomType } from '@/types/room'
import { ROOM_TYPE_LABELS } from '@/types/room'
import { PhotoAnnotator } from './PhotoAnnotator'
import BeforeAfterComparison from './BeforeAfterComparison'
import MoistureMappingCanvas from './MoistureMappingCanvas'

const ROOM_ICON_MAP: Record<RoomType, LucideIcon> = {
  MASTER_BEDROOM: BedDouble, BEDROOM: BedSingle, BATHROOM: Bath,
  ENSUITE: ShowerHead, KITCHEN: CookingPot, LIVING_ROOM: Sofa,
  FAMILY_ROOM: Tv, DINING_ROOM: Utensils, LAUNDRY: Shirt,
  HALLWAY: DoorOpen, GARAGE: Car, ATTIC: Triangle,
  BASEMENT: ArrowDownToLine, CRAWL_SPACE: MoveHorizontal,
  OFFICE: Monitor, STUDY: BookOpen, OUTDOOR: Trees,
  ROOF_CAVITY: Home, SUBFLOOR: Layers, STAIRWELL: Footprints,
  OTHER: Square,
}

type WorkspaceTab = 'photos' | 'moisture' | 'scope' | 'floorplan'

interface RoomPhoto {
  id: string
  url: string
  thumbnailUrl: string | null
  location: string | null
  description: string | null
  timestamp: string
}

interface RoomMoistureReading {
  id: string
  location: string
  surfaceType: string
  moistureLevel: number
  depth: string
  notes: string | null
}

interface RoomScopeItem {
  id: string
  itemType: string
  description: string
  isRequired: boolean
  isSelected: boolean
  quantity: number | null
  unit: string | null
}

interface RoomDetail {
  photos: RoomPhoto[]
  moistureReadings: RoomMoistureReading[]
  scopeItems: RoomScopeItem[]
  floorPlanData: string | null
}

const TABS: { id: WorkspaceTab; label: string; icon: LucideIcon }[] = [
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'moisture', label: 'Moisture', icon: Droplets },
  { id: 'scope', label: 'Scope', icon: ClipboardList },
  { id: 'floorplan', label: 'Floor Plan', icon: LayoutGrid },
]

interface RoomWorkspaceProps {
  room: Room | null
  inspectionId: string
}

export default function RoomWorkspace({ room, inspectionId }: RoomWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('photos')
  const [detail, setDetail] = useState<RoomDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Annotator state
  const [annotatorPhoto, setAnnotatorPhoto] = useState<RoomPhoto | null>(null)

  // Before/after comparison state
  const [compareMode, setCompareMode] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevRoomId = useRef<string | null>(null)

  const fetchRoomDetail = useCallback(async () => {
    if (!room) return
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/rooms/${room.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetail({
          photos: data.room.photos ?? [],
          moistureReadings: data.room.moistureReadings ?? [],
          scopeItems: data.room.scopeItems ?? [],
          floorPlanData: data.room.floorPlanData ?? null,
        })
      }
    } catch {
      // offline — keep stale detail
    } finally {
      setDetailLoading(false)
    }
  }, [room, inspectionId])

  // Reload detail when room changes
  useEffect(() => {
    if (room?.id !== prevRoomId.current) {
      prevRoomId.current = room?.id ?? null
      setDetail(null)
      setAnnotatorPhoto(null)
      setCompareMode(false)
      if (room) fetchRoomDetail()
    }
  }, [room, fetchRoomDetail])

  // Re-fetch when switching to tabs that need fresh data
  useEffect(() => {
    if (room && !detail && !detailLoading) fetchRoomDetail()
  }, [activeTab, room, detail, detailLoading, fetchRoomDetail])

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !room) return

    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('roomId', room.id)
      formData.append('location', room.name)

      const res = await fetch(`/api/inspections/${inspectionId}/photos`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        setDetail(prev => prev ? { ...prev, photos: [...prev.photos, data.photo] } : prev)
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mx-auto mb-4">
            <Camera className="w-7 h-7 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No room selected</h3>
          <p className="text-sm text-slate-400">
            Select a room from the sidebar or add a new room to begin documenting.
          </p>
        </div>
      </div>
    )
  }

  const RoomIcon = ROOM_ICON_MAP[room.type]
  const photos = detail?.photos ?? []
  const canCompare = photos.length >= 2

  return (
    <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
      {/* Room header */}
      <div className="flex items-center gap-3 px-4 py-3 md:px-6 md:py-4 border-b border-slate-700/50 bg-slate-800/30">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
          <RoomIcon className="w-5 h-5 text-cyan-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white truncate">{room.name}</h2>
          <p className="text-xs text-slate-400">
            {ROOM_TYPE_LABELS[room.type]}
            {room.length && room.width && (
              <span className="ml-2 text-slate-500">
                {room.length}m × {room.width}m{room.height ? ` × ${room.height}m` : ''}
              </span>
            )}
          </p>
        </div>
        {/* Photo count badge */}
        {photos.length > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            {photos.length} photo{photos.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-slate-700/50 bg-slate-800/20">
        <nav className="flex overflow-x-auto px-2 md:px-4" aria-label="Room workspace tabs">
          {TABS.map((tab) => {
            const TabIcon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-cyan-400 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
                )}
                aria-selected={isActive}
                role="tab"
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {detailLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
          </div>
        )}

        {!detailLoading && activeTab === 'photos' && (
          <div className="p-4 md:p-6 space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-400 transition-colors disabled:opacity-50"
              >
                {uploadingPhoto
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Camera className="w-4 h-4" />
                }
                {uploadingPhoto ? 'Uploading…' : 'Add Photo'}
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-600/50 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>

              {canCompare && (
                <button
                  onClick={() => setCompareMode(v => !v)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ml-auto',
                    compareMode
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'border border-slate-600/50 text-slate-300 hover:bg-slate-800'
                  )}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  {compareMode ? 'Exit Compare' : 'Before/After'}
                </button>
              )}
            </div>

            {/* Before/After comparison mode */}
            {compareMode && canCompare && (
              <BeforeAfterComparison
                beforeUrl={photos[0].url}
                afterUrl={photos[photos.length - 1].url}
                beforeDate={photos[0].timestamp}
                afterDate={photos[photos.length - 1].timestamp}
              />
            )}

            {/* Photo grid */}
            {!compareMode && photos.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-3">
                  <Camera className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-sm text-slate-400">No photos yet. Tap "Add Photo" to capture.</p>
              </div>
            )}

            {!compareMode && photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => setAnnotatorPhoto(photo)}
                    className="group relative aspect-square rounded-xl overflow-hidden bg-slate-800 border border-slate-700/50 hover:border-cyan-500/50 transition-all"
                  >
                    <img
                      src={photo.thumbnailUrl ?? photo.url}
                      alt={photo.location ?? 'Room photo'}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {photo.location && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                        <p className="text-xs text-white truncate">{photo.location}</p>
                      </div>
                    )}
                  </button>
                ))}
                {/* Add photo tile */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-slate-700 hover:border-cyan-500/50 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-cyan-400 transition-all"
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-xs">Add</span>
                </button>
              </div>
            )}
          </div>
        )}

        {!detailLoading && activeTab === 'moisture' && (
          <div className="p-4 md:p-6 space-y-4">
            {detail?.moistureReadings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-3">
                  <Droplets className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-sm text-slate-400">No moisture readings for this room yet.</p>
              </div>
            ) : (
              <>
                <MoistureMappingCanvas
                  readings={detail?.moistureReadings.map(r => ({
                    id: r.id,
                    location: r.location,
                    surfaceType: r.surfaceType,
                    moistureLevel: r.moistureLevel,
                    depth: r.depth,
                    notes: r.notes,
                  })) ?? []}
                  className="rounded-xl overflow-hidden"
                  readonly={false}
                />
                <div className="space-y-2">
                  {detail?.moistureReadings.map(r => (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: r.moistureLevel < 15 ? '#10b981' : r.moistureLevel < 25 ? '#f59e0b' : r.moistureLevel < 40 ? '#f97316' : '#ef4444' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{r.location}</p>
                        <p className="text-xs text-slate-400">{r.surfaceType} · {r.depth}</p>
                      </div>
                      <span className="text-sm font-semibold text-white tabular-nums">{r.moistureLevel}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {!detailLoading && activeTab === 'scope' && (
          <div className="p-4 md:p-6 space-y-2">
            {!detail?.scopeItems.length ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-3">
                  <ClipboardList className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-sm text-slate-400">No scope items for this room. Run classification to auto-determine.</p>
              </div>
            ) : (
              detail?.scopeItems.map(item => (
                <div key={item.id} className={cn(
                  'flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors',
                  item.isSelected
                    ? 'bg-cyan-500/5 border-cyan-500/20'
                    : 'bg-slate-800/50 border-slate-700/50'
                )}>
                  {item.isSelected
                    ? <CheckSquare className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                    : <div className="w-4 h-4 rounded border border-slate-600 mt-0.5 flex-shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{item.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{item.itemType}</span>
                      {item.quantity && item.unit && (
                        <span className="text-xs text-slate-500">{item.quantity} {item.unit}</span>
                      )}
                      {item.isRequired && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Required</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!detailLoading && activeTab === 'floorplan' && (
          <div className="p-4 md:p-6">
            <MoistureMappingCanvas
              readings={detail?.moistureReadings.map(r => ({
                id: r.id,
                location: r.location,
                surfaceType: r.surfaceType,
                moistureLevel: r.moistureLevel,
                depth: r.depth,
                notes: r.notes,
              })) ?? []}
              initialBackgroundImage={detail?.floorPlanData ?? null}
              className="rounded-xl overflow-hidden"
              readonly={false}
              onBackgroundImageChange={async (imageUrl) => {
                // Save floor plan image back to room
                await fetch(`/api/inspections/${inspectionId}/rooms/${room.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ floorPlanData: imageUrl }),
                })
              }}
            />
          </div>
        )}
      </div>

      {/* Photo Annotator modal */}
      {annotatorPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-900">
            <p className="text-sm font-medium text-white truncate">
              {annotatorPhoto.location ?? room.name}
            </p>
            <button
              onClick={() => setAnnotatorPhoto(null)}
              className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <PhotoAnnotator
              imageUrl={annotatorPhoto.url}
              onSave={async (annotations) => {
                // Persist annotations to the room
                await fetch(`/api/inspections/${inspectionId}/rooms/${room.id}/annotations`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ annotations, photoId: annotatorPhoto.id }),
                })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
