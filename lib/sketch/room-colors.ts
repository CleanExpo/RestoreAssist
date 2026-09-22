/**
 * Shared room fill / stroke swatches for the floor-plan editor.
 *
 * One list: the room tool, Vision import, and the selection-panel colour
 * picker must stay in lock-step. The same fills are the only surviving
 * signal on sketches saved before Fabric 7 started keeping `data`.
 */

export const ROOM_TOOL_FILL = "rgba(28,46,71,0.08)";

export type RoomColor = {
  fill: string;
  stroke: string;
  label: string;
};

export const ROOM_COLORS: readonly RoomColor[] = [
  {
    fill: "rgba(59,130,246,0.10)",
    stroke: "#3b82f6",
    label: "Living / Common",
  },
  { fill: "rgba(16,185,129,0.10)", stroke: "#10b981", label: "Bedroom" },
  { fill: "rgba(245,158,11,0.10)", stroke: "#f59e0b", label: "Kitchen" },
  { fill: "rgba(236,72,153,0.10)", stroke: "#ec4899", label: "Bathroom / WC" },
  {
    fill: "rgba(139,92,246,0.10)",
    stroke: "#8b5cf6",
    label: "Garage / Utility",
  },
  { fill: "rgba(239,68,68,0.10)", stroke: "#ef4444", label: "Damage Zone" },
];

function fillKey(fill: string): string {
  const compact = fill.replace(/\s+/g, "").toLowerCase();
  const match = compact.match(/^rgba\((\d+),(\d+),(\d+),([0-9.]+)\)$/);
  if (!match) return compact;
  return `rgba(${match[1]},${match[2]},${match[3]},${Number(match[4])})`;
}

const ROOM_FILL_KEYS = new Set<string>([
  fillKey(ROOM_TOOL_FILL),
  ...ROOM_COLORS.map((color) => fillKey(color.fill)),
]);

/** True when `fill` matches a room-tool or ROOM_COLORS swatch. */
export function isRoomAllowlistFill(fill: unknown): boolean {
  return typeof fill === "string" && ROOM_FILL_KEYS.has(fillKey(fill));
}
