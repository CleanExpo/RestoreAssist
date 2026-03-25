export type RoomType =
  | 'MASTER_BEDROOM' | 'BEDROOM' | 'BATHROOM' | 'ENSUITE' | 'KITCHEN'
  | 'LIVING_ROOM' | 'FAMILY_ROOM' | 'DINING_ROOM' | 'LAUNDRY' | 'HALLWAY'
  | 'GARAGE' | 'ATTIC' | 'BASEMENT' | 'CRAWL_SPACE' | 'OFFICE' | 'STUDY'
  | 'OUTDOOR' | 'ROOF_CAVITY' | 'SUBFLOOR' | 'STAIRWELL' | 'OTHER'

export type AnnotationType = 'ARROW' | 'CIRCLE' | 'RECTANGLE' | 'TEXT' | 'FREEHAND' | 'MEASUREMENT' | 'DAMAGE_ZONE'

export interface Room {
  id: string
  inspectionId: string
  name: string
  type: RoomType
  sortOrder: number
  thumbnailUrl: string | null
  floorPlanData: string | null
  length: number | null
  width: number | null
  height: number | null
  _count?: { photos: number; moistureReadings: number; annotations: number }
  createdAt: string
  updatedAt: string
}

export interface RoomAnnotation {
  id: string
  roomId: string
  type: AnnotationType
  data: string // JSON
  photoId: string | null
  createdAt: string
  updatedAt: string
}

export type InspectionLayout = 'ROOM_FIRST' | 'TIMELINE' | 'QUICK_CAPTURE'

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  MASTER_BEDROOM: 'Master Bedroom',
  BEDROOM: 'Bedroom',
  BATHROOM: 'Bathroom',
  ENSUITE: 'Ensuite',
  KITCHEN: 'Kitchen',
  LIVING_ROOM: 'Living Room',
  FAMILY_ROOM: 'Family Room',
  DINING_ROOM: 'Dining Room',
  LAUNDRY: 'Laundry',
  HALLWAY: 'Hallway',
  GARAGE: 'Garage',
  ATTIC: 'Attic',
  BASEMENT: 'Basement',
  CRAWL_SPACE: 'Crawl Space',
  OFFICE: 'Office',
  STUDY: 'Study',
  OUTDOOR: 'Outdoor',
  ROOF_CAVITY: 'Roof Cavity',
  SUBFLOOR: 'Subfloor',
  STAIRWELL: 'Stairwell',
  OTHER: 'Other',
}

export const ROOM_TYPE_ICONS: Record<RoomType, string> = {
  MASTER_BEDROOM: 'bed-double',
  BEDROOM: 'bed-single',
  BATHROOM: 'bath',
  ENSUITE: 'shower-head',
  KITCHEN: 'cooking-pot',
  LIVING_ROOM: 'sofa',
  FAMILY_ROOM: 'tv',
  DINING_ROOM: 'utensils',
  LAUNDRY: 'shirt',
  HALLWAY: 'door-open',
  GARAGE: 'car',
  ATTIC: 'triangle',
  BASEMENT: 'arrow-down-to-line',
  CRAWL_SPACE: 'move-horizontal',
  OFFICE: 'monitor',
  STUDY: 'book-open',
  OUTDOOR: 'trees',
  ROOF_CAVITY: 'home',
  SUBFLOOR: 'layers',
  STAIRWELL: 'stairs',
  OTHER: 'square',
}
