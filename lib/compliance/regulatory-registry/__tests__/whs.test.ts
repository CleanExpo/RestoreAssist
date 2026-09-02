import { describe, expect, it } from "vitest";
import { regulationFor, regulation } from "../index";
import { WHS_ENTRIES } from "../whs";

/**
 * The duties behind the Notifiable Incident Record.
 *
 * These entries exist because lib/compliance/safework-notification-gate.ts told
 * contractors they had 24 HOURS to notify the regulator, counted from the
 * INSPECTION DATE, under a comment reading "per WHS Act". Neither half is in
 * either country's Act. The tests below are written from the sources, not from
 * the code -- which is the mistake that let the original defect live.
 */

describe("the notification duty says what the Act says", () => {
  it("requires Australian notification IMMEDIATELY, with no hour figure", () => {
    const au = regulation("whs.notifiable-incident-duty.au");
    expect(au.requirement).toMatch(/immediately/i);

    // The original draft of this test forbade ANY hour figure and failed on the
    // entry's own 48-hour written follow-up -- an assertion blunter than the
    // property, which is the mistake evals/cases/assertion-matches-the-property
    // exists for. The real property: 24 hours must appear nowhere, and the only
    // hour figure permitted is the conditional 48-hour follow-up.
    expect(au.requirement).not.toMatch(/24\s*hours?/i);
    const hourFigures = au.requirement.match(/\b\d+\s*hours?\b/gi) ?? [];
    expect(hourFigures.every((h) => /^48\s*hours?$/i.test(h))).toBe(true);
  });

  it("requires New Zealand notification AS SOON AS POSSIBLE, with no hour figure", () => {
    const nz = regulation("whs.notifiable-incident-duty.nz");
    expect(nz.requirement).toMatch(/as soon as possible/i);
    expect(nz.requirement).not.toMatch(/\b\d+\s*(hours?|hrs?)\b/i);
  });

  it("says the clock runs from BECOMING AWARE, not from any other event", () => {
    // The second half of the original defect. A duty that starts at the right
    // moment is the difference between compliant and already late.
    for (const id of [
      "whs.notifiable-incident-duty.au",
      "whs.notifiable-incident-duty.nz",
    ]) {
      expect(regulation(id).requirement).toMatch(/becom\w+ aware/i);
    }
  });

  it("keeps the 48-hour written follow-up as a follow-up, not an alternative", () => {
    // The only time figure in the WHS Act, and it is conditional on the
    // regulator asking. Stating it without that condition would recreate the
    // original defect with a different number.
    const au = regulation("whs.notifiable-incident-duty.au");
    expect(au.requirement).toMatch(/48 hours only where the regulator asks/i);
  });

  it("does not assert the 2025 amendments as in force", () => {
    // Safe Work Australia has published them; each jurisdiction adopts on its
    // own timetable and SWA's own guidance is to check with your regulator.
    const au = regulation("whs.notifiable-incident-duty.au");
    expect(au.requirement).toMatch(/commencement of those amendments varies/i);
    expect(au.requirement).toMatch(/check with your regulator/i);
  });

  it("says the model Act is enacted separately by each state", () => {
    expect(regulation("whs.notifiable-incident-duty.au").requirement).toMatch(
      /each state and territory enacts its own version/i,
    );
  });
});

describe("site preservation names what is always permitted", () => {
  it("lists the four permitted actions in the Australian entry", () => {
    // A preservation duty stated without its exceptions reads as "touch
    // nothing", and someone will believe it while a person needs help.
    const au = regulation("whs.incident-site-preservation.au");
    for (const permitted of [
      /helping an injured person/i,
      /removing a deceased person/i,
      /making the site safe/i,
      /assisting a police investigation/i,
    ]) {
      expect(au.requirement).toMatch(permitted);
    }
  });

  it("keeps the New Zealand duty to its own wording", () => {
    const nz = regulation("whs.incident-site-preservation.nz");
    expect(nz.requirement).toMatch(/permission for normal work to resume/i);
  });
});

describe("a New Zealand job never receives Australian law", () => {
  it("resolves each duty to its own country", () => {
    expect(regulationFor("whs", "AU", "notifiable-incident-duty")?.id).toBe(
      "whs.notifiable-incident-duty.au",
    );
    expect(regulationFor("whs", "NZ", "notifiable-incident-duty")?.id).toBe(
      "whs.notifiable-incident-duty.nz",
    );
    expect(regulationFor("whs", "NZ", "incident-site-preservation")?.id).toBe(
      "whs.incident-site-preservation.nz",
    );
  });

  it("falls back from an Australian state to the model Act, and never to NZ", () => {
    for (const state of ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const) {
      expect(regulationFor("whs", state, "notifiable-incident-duty")?.id).toBe(
        "whs.notifiable-incident-duty.au",
      );
    }
  });
});

describe("every entry is sourced", () => {
  it("carries an https source, a checked date and a primary-source grade", () => {
    expect(WHS_ENTRIES).toHaveLength(4);
    for (const e of WHS_ENTRIES) {
      expect(e.sourceUrl).toMatch(/^https:\/\//);
      expect(e.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.verification).toBe("primary-source");
      expect(e.provision).toBeTruthy();
    }
  });
});
