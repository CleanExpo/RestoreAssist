/**
 * RA-8497. An iCalendar (RFC 5545) file for one booked site visit, so a
 * technician can add it to Outlook, Google or Apple Calendar.
 *
 * - METHOD:PUBLISH, not REQUEST: a REQUEST needs an ORGANIZER and ATTENDEEs,
 *   and makes Outlook send accept or decline replies to a mailbox nobody
 *   reads. Acknowledging a visit stays in RestoreAssist.
 * - Times carry the organisation's timezone (DTSTART;TZID=...) with a
 *   VTIMEZONE block, so the event reads as the office booked it. A zone this
 *   file has no rules for is written as UTC instants instead, which every
 *   client converts to the reader's own zone; the instant is right either way.
 * - Lines end in CRLF and fold at 75 octets without splitting a character.
 *   TEXT values are escaped, so a typed title cannot add a property.
 * - The UID is stable per booking, so a later CANCEL can replace the event.
 */
import { wallClockAt } from "@/lib/calendar/zoned-time";

export interface IcsEventInput {
  uid: string;
  start: Date;
  end: Date;
  /** IANA zone of the organisation; one without built-in rules falls back to UTC. */
  timeZone: string;
  summary: string;
  description?: string;
  url?: string;
  /** When the file was made (DTSTAMP). */
  dtstamp: Date;
  sequence?: number;
}

type Observance = {
  kind: "STANDARD" | "DAYLIGHT";
  /** Local onset in the offset it changes FROM, YYYYMMDDTHHMMSS. */
  dtstart: string;
  rrule?: string;
  from: string;
  to: string;
  name: string;
};

const fixed = (offset: string, name: string): Observance[] => [
  { kind: "STANDARD", dtstart: "19700101T000000", from: offset, to: offset, name },
];

// Daylight time in NSW, Victoria, Tasmania, the ACT and South Australia runs
// from the first Sunday in October (2 am standard time) to the first Sunday in
// April (3 am daylight time). Checked against the platform's timezone data in
// lib/calendar/__tests__/ics.test.ts.
const southEast = (std: string, dst: string, stdName: string, dstName: string): Observance[] => [
  {
    kind: "STANDARD",
    dtstart: "19700405T030000",
    rrule: "FREQ=YEARLY;BYMONTH=4;BYDAY=1SU",
    from: dst,
    to: std,
    name: stdName,
  },
  {
    kind: "DAYLIGHT",
    dtstart: "19701004T020000",
    rrule: "FREQ=YEARLY;BYMONTH=10;BYDAY=1SU",
    from: std,
    to: dst,
    name: dstName,
  },
];

const AEST_AEDT = southEast("+1000", "+1100", "AEST", "AEDT");
const ACST_ACDT = southEast("+0930", "+1030", "ACST", "ACDT");

const ZONES: Record<string, Observance[]> = {
  "Australia/Sydney": AEST_AEDT,
  "Australia/Melbourne": AEST_AEDT,
  "Australia/Hobart": AEST_AEDT,
  "Australia/Canberra": AEST_AEDT,
  "Australia/Adelaide": ACST_ACDT,
  "Australia/Broken_Hill": ACST_ACDT,
  "Australia/Brisbane": fixed("+1000", "AEST"),
  "Australia/Lindeman": fixed("+1000", "AEST"),
  "Australia/Darwin": fixed("+0930", "ACST"),
  "Australia/Perth": fixed("+0800", "AWST"),
  "Australia/Eucla": fixed("+0845", "ACWST"),
  // Lord Howe Island moves by half an hour, at 2 am local time both ways.
  "Australia/Lord_Howe": [
    {
      kind: "STANDARD",
      dtstart: "19700405T020000",
      rrule: "FREQ=YEARLY;BYMONTH=4;BYDAY=1SU",
      from: "+1100",
      to: "+1030",
      name: "LHST",
    },
    {
      kind: "DAYLIGHT",
      dtstart: "19701004T020000",
      rrule: "FREQ=YEARLY;BYMONTH=10;BYDAY=1SU",
      from: "+1030",
      to: "+1100",
      name: "LHDT",
    },
  ],
  // New Zealand: last Sunday in September to the first Sunday in April.
  "Pacific/Auckland": [
    {
      kind: "STANDARD",
      dtstart: "19700405T030000",
      rrule: "FREQ=YEARLY;BYMONTH=4;BYDAY=1SU",
      from: "+1300",
      to: "+1200",
      name: "NZST",
    },
    {
      kind: "DAYLIGHT",
      dtstart: "19700927T020000",
      rrule: "FREQ=YEARLY;BYMONTH=9;BYDAY=-1SU",
      from: "+1200",
      to: "+1300",
      name: "NZDT",
    },
  ],
};

/** Zones written with their own VTIMEZONE; any other zone is written as UTC. */
export const ICS_TIME_ZONES: readonly string[] = Object.keys(ZONES);

// CONTROL characters are not allowed in TEXT (RFC 5545 3.3.11); tab is.
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** RFC 5545 TEXT escaping; line breaks become the two characters \n. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n|\r|\n/g, "\n")
    .replace(CONTROL, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Fold a content line so no physical line exceeds 75 octets. A continuation
 * line starts with one space, which counts toward its 75.
 */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let currentOctets = 0;
  let limit = 75;
  for (const char of line) {
    const octets = encoder.encode(char).length;
    if (currentOctets + octets > limit) {
      out.push(current);
      current = "";
      currentOctets = 0;
      limit = 74;
    }
    current += char;
    currentOctets += octets;
  }
  out.push(current);
  return out.join("\r\n ");
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function utcStamp(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function localStamp(d: Date, timeZone: string): string {
  const w = wallClockAt(d, timeZone);
  return `${pad(w.year, 4)}${pad(w.month)}${pad(w.day)}T${pad(w.hour)}${pad(w.minute)}${pad(w.second)}`;
}

/** A URI value: no control characters, so no line break can reach the file. */
function uriValue(value: string): string {
  return value.replace(CONTROL, "").replace(/[\r\n]/g, "");
}

export function buildIcsEvent(input: IcsEventInput): string {
  if (!(input.end.getTime() > input.start.getTime())) {
    throw new Error("buildIcsEvent: end must be after start");
  }
  const observances = ZONES[input.timeZone];
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RestoreAssist//Site visit//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (observances) {
    lines.push("BEGIN:VTIMEZONE", `TZID:${input.timeZone}`);
    for (const o of observances) {
      lines.push(
        `BEGIN:${o.kind}`,
        `DTSTART:${o.dtstart}`,
        ...(o.rrule ? [`RRULE:${o.rrule}`] : []),
        `TZOFFSETFROM:${o.from}`,
        `TZOFFSETTO:${o.to}`,
        `TZNAME:${o.name}`,
        `END:${o.kind}`,
      );
    }
    lines.push("END:VTIMEZONE");
  }
  const time = (d: Date) =>
    observances
      ? `;TZID=${input.timeZone}:${localStamp(d, input.timeZone)}`
      : `:${utcStamp(d)}`;
  lines.push(
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(input.uid)}`,
    `DTSTAMP:${utcStamp(input.dtstamp)}`,
    `DTSTART${time(input.start)}`,
    `DTEND${time(input.end)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
  );
  if (input.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  }
  if (input.url) lines.push(`URL:${uriValue(input.url)}`);
  lines.push(
    `SEQUENCE:${input.sequence ?? 0}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
