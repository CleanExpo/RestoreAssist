/**
 * P4-6 — plain-language labels for homeowner-facing surfaces.
 * Insurer/reviewer routes keep technical detail; portal projections use these.
 */

const ROOM_LABELS: Record<string, string> = {
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  bedroom: "Bedroom",
  lounge: "Living area",
  hallway: "Hallway",
};

export function plainRoomLabel(raw: string | null | undefined): string {
  if (!raw?.trim()) return "Affected area";
  const key = raw.trim().toLowerCase();
  for (const [needle, label] of Object.entries(ROOM_LABELS)) {
    if (key.includes(needle)) return label;
  }
  return raw.trim();
}

export function plainStatusSentence(status: string): string {
  switch (status) {
    case "DRAFT":
      return "We have received your claim and are preparing the site visit.";
    case "SUBMITTED":
    case "PROCESSING":
      return "Your claim is being reviewed by the restoration team.";
    case "CLASSIFIED":
      return "The damage has been assessed and drying plans are being prepared.";
    case "SCOPED":
    case "ESTIMATED":
      return "Scope and next steps are being finalised for your approval.";
    case "IN_BILLING":
    case "COMPLETED":
    case "CLOSED":
      return "Restoration work is winding down and final paperwork is in progress.";
    default:
      return "Your restoration provider is updating this job.";
  }
}
