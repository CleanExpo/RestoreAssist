/** Labels are the legacy AffectedArea room identifier; keep type in the label. */
export const ROOM_TYPES = [
  "Master Bedroom",
  "Bedroom",
  "Bathroom",
  "Ensuite",
  "Kitchen",
  "Living Room",
  "Lounge",
  "Family Room",
  "Dining Room",
  "Laundry",
  "Hallway",
  "Garage",
  "Attic",
  "Basement",
  "Office",
  "Study",
  "Other",
] as const;

export type RoomTypeLabel = (typeof ROOM_TYPES)[number];

export function formatRoomZoneLabel(type: string, name: string): string {
  const roomType = type.trim();
  const roomName = name.trim().replace(/\s+/g, " ");
  if (roomType === "Other") return roomName;
  if (!roomName) return roomType;
  if (/^\d+$/.test(roomName)) return `${roomType} ${roomName}`;
  const lowerName = roomName.toLocaleLowerCase();
  const lowerType = roomType.toLocaleLowerCase();
  if (
    lowerName === lowerType ||
    lowerName.startsWith(`${lowerType} `) ||
    lowerName.startsWith(`${lowerType} — `)
  ) {
    return roomName;
  }
  return `${roomType} — ${roomName}`;
}

/** Unknown historical free-text names remain Other; never guess a category. */
export function inferRoomTypeFromLabel(label: string): RoomTypeLabel {
  const value = label.trim().toLocaleLowerCase();
  return (
    ROOM_TYPES.filter((type) => type !== "Other")
      .sort((a, b) => b.length - a.length)
      .find((type) => {
        const prefix = type.toLocaleLowerCase();
        return (
          value === prefix ||
          value.startsWith(`${prefix} `) ||
          value.startsWith(`${prefix} — `)
        );
      }) ?? "Other"
  );
}

/** Suggest the next number while leaving existing, possibly unnumbered rows alone. */
export function nextRoomName(type: string, existingLabels: string[]): string {
  if (type === "Other") return "";
  const prefix = type.toLocaleLowerCase();
  const numbers = existingLabels.flatMap((label) => {
    const value = label.trim().toLocaleLowerCase();
    if (value === prefix) return [1];
    const suffix = value.startsWith(`${prefix} `)
      ? value.slice(prefix.length + 1)
      : "";
    return /^\d+$/.test(suffix) ? [Number(suffix)] : [];
  });
  return numbers.length > 0 ? String(Math.max(...numbers) + 1) : "";
}

export function newRoomEntryId(): string {
  return crypto.randomUUID();
}
