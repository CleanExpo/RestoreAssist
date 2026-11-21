/**
 * RA-8497. The calendar file a technician gets for a booked site visit.
 *
 * Parsed with ical.js (Mozilla's parser, used by Thunderbird), never with a
 * mirror of the generator, so a file that only our own code can read fails
 * here. Every time is checked against an instant fixed in UTC and against the
 * wall-clock the office booked, in the organisation's timezone. The process
 * timezone is never read: CI runs in UTC and this machine in Sydney.
 */
import { afterEach, describe, expect, it } from "vitest";
import ICAL from "ical.js";
import {
  buildIcsEvent,
  escapeIcsText,
  foldIcsLine,
  ICS_TIME_ZONES,
} from "../ics";

const DTSTAMP = new Date("2026-11-21T00:00:00Z");

function event(overrides: Partial<Parameters<typeof buildIcsEvent>[0]> = {}) {
  return buildIcsEvent({
    uid: "job-appointment-abc123@restoreassist",
    start: new Date("2026-01-14T22:00:00Z"),
    end: new Date("2026-01-15T00:00:00Z"),
    timeZone: "Australia/Sydney",
    summary: "Site visit (job NIR-2026-01-0001)",
    description: "Open the job in RestoreAssist.",
    url: "https://app.example.test/dashboard/inspections/abc123",
    dtstamp: DTSTAMP,
    ...overrides,
  });
}

/** Parse with ical.js and register the file's own VTIMEZONE, if any. */
function parse(ics: string) {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(vtz);
  }
  const vevent = root.getFirstSubcomponent("vevent");
  if (!vevent) throw new Error("no VEVENT");
  return { root, vevent, event: new ICAL.Event(vevent) };
}

afterEach(() => {
  ICAL.TimezoneService.reset();
});

function wallClock(time: ICAL.Time): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${time.year}-${pad(time.month)}-${pad(time.day)} ${pad(time.hour)}:${pad(time.minute)}`;
}

describe("buildIcsEvent: the organisation's timezone", () => {
  const cases: Array<{
    name: string;
    timeZone: string;
    start: string;
    end: string;
    wallStart: string;
    wallEnd: string;
  }> = [
    {
      name: "Sydney in January (daylight time, +11:00), UTC date is the day before",
      timeZone: "Australia/Sydney",
      start: "2026-01-14T22:00:00Z",
      end: "2026-01-15T00:00:00Z",
      wallStart: "2026-01-15 09:00",
      wallEnd: "2026-01-15 11:00",
    },
    {
      name: "Sydney in July (standard time, +10:00)",
      timeZone: "Australia/Sydney",
      start: "2026-07-14T23:00:00Z",
      end: "2026-07-15T01:00:00Z",
      wallStart: "2026-07-15 09:00",
      wallEnd: "2026-07-15 11:00",
    },
    {
      name: "Brisbane in January (no daylight time, +10:00)",
      timeZone: "Australia/Brisbane",
      start: "2026-01-14T23:00:00Z",
      end: "2026-01-15T01:00:00Z",
      wallStart: "2026-01-15 09:00",
      wallEnd: "2026-01-15 11:00",
    },
    {
      name: "Adelaide in January (half-hour offset, +10:30)",
      timeZone: "Australia/Adelaide",
      start: "2026-01-14T22:30:00Z",
      end: "2026-01-15T00:30:00Z",
      wallStart: "2026-01-15 09:00",
      wallEnd: "2026-01-15 11:00",
    },
    {
      name: "Perth in July (+08:00)",
      timeZone: "Australia/Perth",
      start: "2026-07-15T01:00:00Z",
      end: "2026-07-15T03:00:00Z",
      wallStart: "2026-07-15 09:00",
      wallEnd: "2026-07-15 11:00",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const ics = event({
        timeZone: c.timeZone,
        start: new Date(c.start),
        end: new Date(c.end),
      });
      const { event: parsed, vevent } = parse(ics);
      // The file names the organisation's zone, not UTC.
      expect(vevent.getFirstProperty("dtstart")?.getParameter("tzid")).toBe(
        c.timeZone,
      );
      expect(parsed.startDate.zone?.tzid).toBe(c.timeZone);
      // Read as the office booked it ...
      expect(wallClock(parsed.startDate)).toBe(c.wallStart);
      expect(wallClock(parsed.endDate)).toBe(c.wallEnd);
      // ... and the same instants the booking stored.
      expect(parsed.startDate.toJSDate().toISOString()).toBe(
        new Date(c.start).toISOString(),
      );
      expect(parsed.endDate.toJSDate().toISOString()).toBe(
        new Date(c.end).toISOString(),
      );
    });
  }

  it("every VTIMEZONE agrees with the platform's timezone data, built-in and generated", () => {
    // Read the way a calendar reads DTSTART;TZID: a wall-clock in the zone,
    // turned into an instant by the file's own VTIMEZONE. A rule typed wrong
    // (a month, a Sunday, an offset) moves a week or more of times.
    //
    // The two hours either side of a changeover are left out: ical.js reads
    // that window an hour late (it reports the old offset until an hour after
    // the change, for the standard tzurl.org rules too), and an office books
    // no visit between 2 am and 3 am on a changeover Sunday.
    const offsetFormats = new Map<string, Intl.DateTimeFormat>();
    const intlOffset = (timeZone: string, t: number) => {
      let fmt = offsetFormats.get(timeZone);
      if (!fmt) {
        fmt = new Intl.DateTimeFormat("en-AU", {
          timeZone,
          timeZoneName: "longOffset",
        });
        offsetFormats.set(timeZone, fmt);
      }
      return fmt
        .formatToParts(new Date(t))
        .find((p) => p.type === "timeZoneName")?.value;
    };
    const twoHours = 2 * 60 * 60 * 1000;
    // Built-in zones carry yearly rules: check four years. Any other valid
    // zone is generated for the year before the visit (January 2026) to the
    // year after: check 2025 to 2027. Chatham changes by 45 minutes.
    const built = ICS_TIME_ZONES.map((z) => [z, 2026, 2030] as const);
    const generated = [
      "Pacific/Chatham",
      "Europe/London",
      "America/New_York",
      "Asia/Kolkata",
      "America/Sao_Paulo",
    ].map((z) => [z, 2025, 2028] as const);
    for (const [timeZone, fromYear, toYear] of [...built, ...generated]) {
      ICAL.TimezoneService.reset();
      const { event: parsed } = parse(event({ timeZone }));
      const zone = parsed.startDate.zone!;
      const intl = new Intl.DateTimeFormat("en-AU", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      let checked = 0;
      let skipped = 0;
      // Every 90 minutes for four years: each wall-clock hour and half hour
      // is visited on many days of every month.
      const from = Date.UTC(fromYear, 0, 1);
      const to = Date.UTC(toYear, 0, 1);
      for (let t = from; t < to; t += 90 * 60 * 1000) {
        if (intlOffset(timeZone, t - twoHours) !== intlOffset(timeZone, t + twoHours)) {
          skipped += 1;
          continue;
        }
        const parts = Object.fromEntries(
          intl.formatToParts(new Date(t)).map((p) => [p.type, Number(p.value)]),
        );
        const local = ICAL.Time.fromData(
          {
            year: parts.year,
            month: parts.month,
            day: parts.day,
            hour: parts.hour,
            minute: parts.minute,
            second: 0,
          },
          zone,
        );
        const got = local.toJSDate().getTime();
        if (got !== t) {
          throw new Error(
            `${timeZone}: ${wallClock(local)} reads as ${new Date(got).toISOString()}, Intl says ${new Date(t).toISOString()}`,
          );
        }
        checked += 1;
      }
      const years = toYear - fromYear;
      expect(checked).toBeGreaterThan(years * 365 * 16 - 30);
      // Daylight-time zones change twice a year, each changeover leaving out
      // a 4-hour window (at most 3 samples).
      expect(skipped).toBeLessThanOrEqual(years * 2 * 3);
    }
    // About 400,000 parser reads; 20 s locally, so allow slower CI runners.
  }, 120_000);

  it("covers every Australian state and territory capital and New Zealand", () => {
    expect(ICS_TIME_ZONES).toEqual(
      expect.arrayContaining([
        "Australia/Sydney",
        "Australia/Melbourne",
        "Australia/Brisbane",
        "Australia/Adelaide",
        "Australia/Perth",
        "Australia/Hobart",
        "Australia/Darwin",
        "Australia/Canberra",
        "Pacific/Auckland",
      ]),
    );
  });

  it("a valid zone without built-in rules still carries its TZID and a VTIMEZONE", () => {
    // Pacific/Chatham, January 2026: +13:45.
    const { event: parsed, vevent, root } = parse(
      event({
        timeZone: "Pacific/Chatham",
        start: new Date("2026-01-14T19:15:00Z"),
        end: new Date("2026-01-14T21:15:00Z"),
      }),
    );
    expect(root.getAllSubcomponents("vtimezone")).toHaveLength(1);
    expect(vevent.getFirstProperty("dtstart")?.getParameter("tzid")).toBe(
      "Pacific/Chatham",
    );
    expect(wallClock(parsed.startDate)).toBe("2026-01-15 09:00");
    expect(parsed.startDate.toJSDate().toISOString()).toBe(
      "2026-01-14T19:15:00.000Z",
    );
  });

  it("a generated changeover onset is exact to the minute and written in the offset it leaves", () => {
    // Europe/London 2026: summer time from 01:00 UTC on 29 March (01:00 GMT)
    // to 01:00 UTC on 25 October (02:00 BST).
    const london = event({ timeZone: "Europe/London" });
    expect(london).toContain(
      "BEGIN:DAYLIGHT\r\nDTSTART:20260329T010000\r\nTZOFFSETFROM:+0000\r\nTZOFFSETTO:+0100\r\n",
    );
    expect(london).toContain(
      "BEGIN:STANDARD\r\nDTSTART:20261025T020000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0000\r\n",
    );
    // Australia/LHI (Lord Howe under another name, so generated): daylight
    // time from 02:00 local (+10:30) on 4 October 2026, which is 15:30 UTC,
    // half way between two hourly samples.
    expect(event({ timeZone: "Australia/LHI" })).toContain(
      "DTSTART:20261004T020000\r\nTZOFFSETFROM:+1030\r\nTZOFFSETTO:+1100\r\n",
    );
  });

  it("a timezone the platform does not know falls back to UTC times without throwing", () => {
    for (const timeZone of ["Not/AZone", ""]) {
      let ics = "";
      expect(() => {
        ics = event({ timeZone });
      }).not.toThrow();
      const { event: parsed, root } = parse(ics);
      expect(root.getAllSubcomponents("vtimezone")).toHaveLength(0);
      expect(parsed.startDate.isDate).toBe(false);
      expect(parsed.startDate.toJSDate().toISOString()).toBe(
        "2026-01-14T22:00:00.000Z",
      );
      expect(ics).toContain("DTSTART:20260114T220000Z");
    }
  });
});

describe("buildIcsEvent: RFC 5545 structure", () => {
  it("is one PUBLISH calendar with one event, CRLF line ends and the required properties", () => {
    const ics = event();
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // No bare LF anywhere.
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const { root, vevent } = parse(ics);
    expect(root.getFirstPropertyValue("version")).toBe("2.0");
    expect(root.getFirstPropertyValue("prodid")).toBeTruthy();
    expect(root.getFirstPropertyValue("method")).toBe("PUBLISH");
    expect(root.getAllSubcomponents("vevent")).toHaveLength(1);
    expect(vevent.getFirstPropertyValue("uid")).toBe(
      "job-appointment-abc123@restoreassist",
    );
    expect(String(vevent.getFirstPropertyValue("dtstamp"))).toBe(
      "2026-11-21T00:00:00Z",
    );
    expect(vevent.getFirstPropertyValue("summary")).toBe(
      "Site visit (job NIR-2026-01-0001)",
    );
    expect(vevent.getFirstPropertyValue("url")).toBe(
      "https://app.example.test/dashboard/inspections/abc123",
    );
    expect(vevent.getFirstPropertyValue("sequence")).toBe(0);
  });

  it("folds every line at 75 octets without splitting a multi-byte character", () => {
    const summary = "Visite du chantier é, 東京 ".repeat(20);
    const ics = event({ summary, description: "x".repeat(300) });
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toContain("�");
    }
    const { vevent } = parse(ics);
    expect(vevent.getFirstPropertyValue("summary")).toBe(summary);
    expect(vevent.getFirstPropertyValue("description")).toBe("x".repeat(300));
  });

  it("a title cannot inject a property or end the event early", () => {
    const summary =
      "Visit\r\nATTENDEE:mailto:attacker@example.test\nEND:VEVENT;, \\ done";
    const ics = event({ summary });
    const { root, vevent } = parse(ics);
    expect(vevent.getFirstPropertyValue("summary")).toBe(
      "Visit\nATTENDEE:mailto:attacker@example.test\nEND:VEVENT;, \\ done",
    );
    expect(vevent.getAllProperties("attendee")).toHaveLength(0);
    expect(root.getAllSubcomponents("vevent")).toHaveLength(1);
  });

  it("a URL with a line break cannot inject a property", () => {
    const ics = event({
      url: "https://app.example.test/x\r\nATTENDEE:mailto:a@example.test",
    });
    const { vevent } = parse(ics);
    expect(vevent.getAllProperties("attendee")).toHaveLength(0);
  });

  it("refuses an end that is not after the start", () => {
    expect(() =>
      event({
        start: new Date("2026-01-15T00:00:00Z"),
        end: new Date("2026-01-15T00:00:00Z"),
      }),
    ).toThrow(/after/);
  });
});

describe("escapeIcsText and foldIcsLine", () => {
  it("escapes backslash, semicolon, comma and line breaks, and drops control characters", () => {
    expect(escapeIcsText("a\\b;c,d\r\ne\nf\rg\u0007h")).toBe(
      "a\\\\b\\;c\\,d\\ne\\nf\\ng" + "h",
    );
  });

  it("leaves a 75-octet line alone and folds a 76-octet line", () => {
    expect(foldIcsLine("a".repeat(75))).toBe("a".repeat(75));
    expect(foldIcsLine("a".repeat(76))).toBe(`${"a".repeat(75)}\r\n a`);
  });
});
