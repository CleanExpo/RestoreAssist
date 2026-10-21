/**
 * J3 synthetic claim variants. Deterministic: variant i always has the same
 * category, class, rooms, scope lines, invoice lines and payment mode.
 */
export interface Room {
  name: string;
  lengthM: number;
  widthM: number;
}
export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number; // cents
}
export type PayMode = "partial" | "full" | "over";

export interface Variant {
  key: string; // v00..v44
  category: 1 | 2 | 3;
  cls: 1 | 2 | 3 | 4;
  rooms: Room[];
  /** Sketch rooms carry data.areaM2 (editor path) or geometry only (shoelace path). */
  sketchWithArea: boolean;
  /** Canvas scale the editor saved with the sketch. */
  pxPerMetre: number;
  scope: Array<{ itemType: string; quantity: number; unit: string }>;
  lines: InvoiceLine[];
  pay: PayMode;
  moisture: number[];
}

const ROOM_NAMES = ["Lounge", "Kitchen", "Bedroom 1", "Bedroom 2", "Hallway", "Laundry"];
const SCOPE_TYPES: Array<{ itemType: string; unit: string }> = [
  { itemType: "extract_standing_water", unit: "hr" },
  { itemType: "install_air_movers", unit: "day" },
  { itemType: "install_dehumidification", unit: "day" },
  { itemType: "remove_carpet", unit: "m²" },
  { itemType: "apply_antimicrobial", unit: "m²" },
  { itemType: "demolish_drywall", unit: "m²" },
];
const SIZES = [3, 2.5, 4, 3.6, 5.2, 2.1, 6, 3.3];
const PRICES = [12345, 9999, 4550, 33333, 101, 87650, 2499, 15005];
const QTYS = [1, 2, 0.5, 3, 1.25, 7, 0.333, 4];

export const VARIANT_COUNT = 45;

export function variants(): Variant[] {
  const out: Variant[] = [];
  for (let i = 0; i < VARIANT_COUNT; i++) {
    const nRooms = 1 + (i % 4);
    const rooms: Room[] = [];
    for (let r = 0; r < nRooms; r++) {
      // Variant 0 is the founder's 3 x 3 m single room.
      const l = i === 0 ? 3 : SIZES[(i + r) % SIZES.length];
      const wd = i === 0 ? 3 : SIZES[(i * 3 + r + 1) % SIZES.length];
      rooms.push({ name: ROOM_NAMES[r], lengthM: l, widthM: wd });
    }
    const nScope = 1 + (i % 5);
    const scope = Array.from({ length: nScope }, (_, s) => {
      const t = SCOPE_TYPES[(i + s) % SCOPE_TYPES.length];
      return { ...t, quantity: t.unit === "m²" ? Math.round(rooms[0].lengthM * rooms[0].widthM * 10) / 10 : 1 + ((i + s) % 4) };
    });
    const nLines = 1 + (i % 5);
    const lines = Array.from({ length: nLines }, (_, l) => ({
      description: `J3 line ${l + 1} ${scope[l % scope.length].itemType}`,
      quantity: QTYS[(i + l) % QTYS.length],
      unitPrice: PRICES[(i * 2 + l) % PRICES.length],
    }));
    out.push({
      key: `v${String(i).padStart(2, "0")}`,
      category: ((i % 3) + 1) as 1 | 2 | 3,
      cls: ((Math.floor(i / 3) % 4) + 1) as 1 | 2 | 3 | 4,
      rooms,
      sketchWithArea: i % 2 === 0,
      pxPerMetre: [100, 100, 50, 200][Math.floor(i / 2) % 4],
      scope,
      lines,
      pay: (["partial", "full", "over"] as const)[i % 3],
      moisture: rooms.map((_, r) => 12 + ((i * 7 + r * 11) % 70)),
    });
  }
  return out;
}

export const WATER_SOURCE: Record<1 | 2 | 3, string> = { 1: "clean water supply line", 2: "grey water washing machine", 3: "black water sewage" };
