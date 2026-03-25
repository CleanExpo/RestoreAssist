'use client'

import { useRef, useEffect } from 'react'
import {
  BedDouble,
  BedSingle,
  Bath,
  ShowerHead,
  CookingPot,
  Sofa,
  Tv,
  Utensils,
  Shirt,
  DoorOpen,
  Car,
  Triangle,
  ArrowDownToLine,
  MoveHorizontal,
  Monitor,
  BookOpen,
  Trees,
  Home,
  Layers,
  Footprints,
  Square,
  Camera,
  Droplets,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Room, RoomType } from '@/types/room'
import { ROOM_TYPE_LABELS } from '@/types/room'

const ROOM_ICON_MAP: Record<RoomType, LucideIcon> = {
  MASTER_BEDROOM: BedDouble,
  BEDROOM: BedSingle,
  BATHROOM: Bath,
  ENSUITE: ShowerHead,
  KITCHEN: CookingPot,
  LIVING_ROOM: Sofa,
  FAMILY_ROOM: Tv,
  DINING_ROOM: Utensils,
  LAUNDRY: Shirt,
  HALLWAY: DoorOpen,
  GARAGE: Car,
  ATTIC: Triangle,
  BASEMENT: ArrowDownToLine,
  CRAWL_SPACE: MoveHorizontal,
  OFFICE: Monitor,
  STUDY: BookOpen,
  OUTDOOR: Trees,
  ROOF_CAVITY: Home,
  SUBFLOOR: Layers,
  STAIRWELL: Footprints,
  OTHER: Square,
}

function getCompletenessColour(room: Room): 'green' | 'amber' | 'red' {
  const photos = room._count?.photos ?? 0
  const moisture = room._count?.moistureReadings ?? 0
  if (photos >= 3 && moisture >= 1) return 'green'
  if (photos >= 1) return 'amber'
  return 'red'
}

const COMPLETENESS_STYLES = {
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
} as const

interface RoomNavigationSidebarProps {
  inspectionId: string
  rooms: Room[]
  activeRoomId: string | null
  onSelectRoom: (id: string) => void
  onAddRoom: () => void
}

export default function RoomNavigationSidebar({
  rooms,
  activeRoomId,
  onSelectRoom,
  onAddRoom,
}: RoomNavigationSidebarProps) {
  const activeCardRef = useRef<HTMLButtonElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Scroll active card into view on mount or when activeRoomId changes
  useEffect(() => {
    if (activeCardRef.current) {
      activeCardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }, [activeRoomId])

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-72 lg:w-80 bg-slate-900 border-r border-slate-700/50 h-full overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Rooms ({rooms.length})
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {rooms.map((room) => {
            const Icon = ROOM_ICON_MAP[room.type]
            const completeness = getCompletenessColour(room)
            const isActive = room.id === activeRoomId

            return (
              <button
                key={room.id}
                ref={isActive ? activeCardRef : undefined}
                onClick={() => onSelectRoom(room.id)}
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-all duration-200',
                  'bg-slate-800/50 backdrop-blur-sm border hover:bg-slate-700/50',
                  isActive
                    ? 'border-cyan-500/30 bg-cyan-500/10 ring-1 ring-cyan-500/20'
                    : 'border-slate-700/50'
                )}
              >
                {/* Thumbnail or icon placeholder */}
                <div className="relative flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-slate-700/50 flex items-center justify-center">
                  {room.thumbnailUrl ? (
                    <img
                      src={room.thumbnailUrl}
                      alt={room.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Icon className="w-5 h-5 text-slate-400" />
                  )}
                  {/* Completeness dot */}
                  <span
                    className={cn(
                      'absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-slate-800',
                      COMPLETENESS_STYLES[completeness]
                    )}
                  />
                </div>

                {/* Room info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {room.name}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {ROOM_TYPE_LABELS[room.type]}
                  </p>

                  {/* Badges */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {(room._count?.photos ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Camera className="w-3 h-3" />
                        {room._count?.photos}
                      </span>
                    )}
                    {(room._count?.moistureReadings ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Droplets className="w-3 h-3" />
                        {room._count?.moistureReadings}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Add room button */}
        <div className="p-3 border-t border-slate-700/50">
          <button
            onClick={onAddRoom}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-dashed border-slate-600 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all duration-200 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Room
          </button>
        </div>
      </aside>

      {/* Mobile horizontal strip */}
      <div className="md:hidden w-full bg-slate-900 border-b border-slate-700/50">
        <div
          ref={scrollContainerRef}
          className="flex overflow-x-auto gap-2 p-3 scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {rooms.map((room) => {
            const Icon = ROOM_ICON_MAP[room.type]
            const completeness = getCompletenessColour(room)
            const isActive = room.id === activeRoomId

            return (
              <button
                key={room.id}
                ref={isActive ? activeCardRef : undefined}
                onClick={() => onSelectRoom(room.id)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200',
                  'bg-slate-800/50 backdrop-blur-sm border',
                  isActive
                    ? 'border-cyan-500/30 bg-cyan-500/10'
                    : 'border-slate-700/50'
                )}
              >
                <div className="relative">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <span
                    className={cn(
                      'absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full',
                      COMPLETENESS_STYLES[completeness]
                    )}
                  />
                </div>
                <span className="text-xs font-medium text-white whitespace-nowrap">
                  {room.name}
                </span>
              </button>
            )
          })}

          {/* Mobile add room */}
          <button
            onClick={onAddRoom}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-600 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-xs font-medium whitespace-nowrap">Add</span>
          </button>
        </div>
      </div>
    </>
  )
}
