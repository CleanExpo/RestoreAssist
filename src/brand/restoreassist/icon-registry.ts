/**
 * RestoreAssist branded icon registry — single source of truth for the
 * `[ra:*]` icon token language.
 *
 * Every branded icon has a typed name, an accessible label, and a master SVG
 * under `public/brand/restoreassist/icons/svg/<name>.svg`.
 *
 * AI output and UI copy must use `[ra:name]` tokens instead of Unicode emojis.
 * See `prompts/no-generic-emojis.md` and `docs/RESTOREASSIST_ICON_SYSTEM.md`.
 */

export const RA_ICON_NAMES = [
  "success",
  "warning",
  "critical",
  "evidence",
  "photo",
  "inspection",
  "moisture",
  "room",
  "job",
  "report",
  "task",
  "ai",
  "phone",
  "customer",
  "invoice",
  "shield",
  "drying",
  "claim",
  "map",
  "calendar",
] as const;

export type RAIconName = (typeof RA_ICON_NAMES)[number];

/** Public base path for the master SVG assets. */
export const RA_ICON_SVG_BASE = "/brand/restoreassist/icons/svg";

export interface RAIconMeta {
  /** Stable token name used in `[ra:name]`. */
  name: RAIconName;
  /** Accessible label / alt text. */
  label: string;
  /** Short usage hint for docs + AI guidance. */
  usage: string;
}

export const RA_ICONS: Record<RAIconName, RAIconMeta> = {
  success: { name: "success", label: "Success", usage: "Completed / passed / OK state" },
  warning: { name: "warning", label: "Warning", usage: "Caution / needs attention" },
  critical: { name: "critical", label: "Critical", usage: "Blocking / urgent / failure" },
  evidence: { name: "evidence", label: "Evidence", usage: "Captured evidence / proof item" },
  photo: { name: "photo", label: "Photo", usage: "Photograph / image capture" },
  inspection: { name: "inspection", label: "Inspection", usage: "Site inspection / assessment" },
  moisture: { name: "moisture", label: "Moisture", usage: "Moisture reading / water content" },
  room: { name: "room", label: "Room", usage: "Room / area / zone" },
  job: { name: "job", label: "Job", usage: "Job / work order" },
  report: { name: "report", label: "Report", usage: "Report / document output" },
  task: { name: "task", label: "Task", usage: "Task / checklist item" },
  ai: { name: "ai", label: "AI", usage: "AI assistant / generated content" },
  phone: { name: "phone", label: "Phone", usage: "Call / phone contact" },
  customer: { name: "customer", label: "Customer", usage: "Customer / client / contact" },
  invoice: { name: "invoice", label: "Invoice", usage: "Invoice / billing" },
  shield: { name: "shield", label: "Shield", usage: "Compliance / security / protection" },
  drying: { name: "drying", label: "Drying", usage: "Drying / airflow / dehumidification" },
  claim: { name: "claim", label: "Claim", usage: "Insurance claim" },
  map: { name: "map", label: "Map", usage: "Location / map / service area" },
  calendar: { name: "calendar", label: "Calendar", usage: "Schedule / date / appointment" },
};

const RA_ICON_NAME_SET: ReadonlySet<string> = new Set(RA_ICON_NAMES);

/** Type guard: is `value` a known RestoreAssist icon name? */
export function isRAIconName(value: string): value is RAIconName {
  return RA_ICON_NAME_SET.has(value);
}

/** Resolve the public SVG path for an icon. */
export function raIconSrc(name: RAIconName): string {
  return `${RA_ICON_SVG_BASE}/${name}.svg`;
}

/**
 * Source for a single RestoreAssist icon token, e.g. `[ra:success]`.
 * Build a fresh `RegExp` per iteration via {@link raTokenRegex} — a global
 * regex carries mutable `lastIndex` state and must not be shared.
 */
export const RA_TOKEN_SOURCE = String.raw`\[ra:([a-zA-Z0-9-]+)\]`;

/** Fresh global matcher for splitting strings on icon tokens. */
export function raTokenRegex(): RegExp {
  return new RegExp(RA_TOKEN_SOURCE, "g");
}

export interface RATextSegment {
  type: "text" | "icon";
  /** Text segments: the literal text. Icon segments: the raw `[ra:...]` token. */
  value: string;
  /** Present only on valid icon segments. */
  icon?: RAIconName;
}

/**
 * Parse a string into ordered text/icon segments. Unknown tokens (e.g.
 * `[ra:bogus]`) are preserved as literal text so nothing silently vanishes.
 */
export function parseRATokens(input: string): RATextSegment[] {
  const segments: RATextSegment[] = [];
  if (!input) return segments;
  const re = raTokenRegex();
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    const [raw, rawName] = match;
    if (match.index > last) {
      segments.push({ type: "text", value: input.slice(last, match.index) });
    }
    const name = rawName.toLowerCase();
    if (isRAIconName(name)) {
      segments.push({ type: "icon", value: raw, icon: name });
    } else {
      segments.push({ type: "text", value: raw });
    }
    last = match.index + raw.length;
  }
  if (last < input.length) {
    segments.push({ type: "text", value: input.slice(last) });
  }
  return segments;
}
