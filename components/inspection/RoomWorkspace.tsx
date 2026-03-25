'use client'

import { useState } from 'react'
import {
  Camera,
  Droplets,
  ClipboardList,
  LayoutGrid,
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

type WorkspaceTab = 'photos' | 'moisture' | 'scope' | 'floorplan'

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

export default function RoomWorkspace({ room }: RoomWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('photos')

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mx-auto mb-4">
            <Camera className="w-7 h-7 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">
            No room selected
          </h3>
          <p className="text-sm text-slate-400">
            Select a room from the sidebar or add a new room to begin
            documenting.
          </p>
        </div>
      </div>
    )
  }

  const RoomIcon = ROOM_ICON_MAP[room.type]

  return (
    <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
      {/* Room header */}
      <div className="flex items-center gap-3 px-4 py-3 md:px-6 md:py-4 border-b border-slate-700/50 bg-slate-800/30">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
          <RoomIcon className="w-5 h-5 text-cyan-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white truncate">
            {room.name}
          </h2>
          <p className="text-xs text-slate-400">
            {ROOM_TYPE_LABELS[room.type]}
            {room.length && room.width && (
              <span className="ml-2 text-slate-500">
                {room.length}m x {room.width}m
                {room.height ? ` x ${room.height}m` : ''}
              </span>
            )}
          </p>
        </div>
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

      {/* Tab content area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {activeTab === 'photos' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-3">
              <Camera className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-sm text-slate-400 text-center">
              Photo capture and gallery will appear here.
            </p>
          </div>
        )}

        {activeTab === 'moisture' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-3">
              <Droplets className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-sm text-slate-400 text-center">
              Moisture readings and mapping will appear here.
            </p>
          </div>
        )}

        {activeTab === 'scope' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-3">
              <ClipboardList className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-sm text-slate-400 text-center">
              Scope of works entries will appear here.
            </p>
          </div>
        )}

        {activeTab === 'floorplan' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-3">
              <LayoutGrid className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-sm text-slate-400 text-center">
              Floor plan sketch and annotations will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
