import { beforeEach, describe, expect, it } from "vitest";
import { computeWalkthroughStatus, newestSectionObservationAt } from "../status";
import { FIRE_SECTION_IDS } from "../checklist";
import { TECH, allFilled, entry, lastAt, na, notice, resetClock, signoff } from "./helpers";

const status = (rows: Parameters<typeof computeWalkthroughStatus>[1]) =>
  computeWalkthroughStatus(FIRE_SECTION_IDS, rows, TECH);

beforeEach(resetClock);

describe("computeWalkthroughStatus", () => {
  it("zero observations: not started, every section To do, sign-off refused", () => {
    const s = status([]);
    expect(s.started).toBe(false);
    expect(s.openSectionIds).toEqual([...FIRE_SECTION_IDS]);
    expect(s.canSignOff).toBe(false);
    expect(s.signoff.state).toBe("unsigned");
  });

  it("a notice alone does not start the walkthrough", () => {
    const s = status([notice()]);
    expect(s.noticeAcknowledged).toBe(true);
    expect(s.started).toBe(false);
  });

  it("a notice counts only for the technician who acknowledged it", () => {
    const rows = [{ ...notice(), userId: "user-tech-2" }];
    expect(status(rows).noticeAcknowledged).toBe(false);
    expect(computeWalkthroughStatus(FIRE_SECTION_IDS, rows, "user-tech-2").noticeAcknowledged).toBe(true);
    expect(computeWalkthroughStatus(FIRE_SECTION_IDS, [notice()], null).noticeAcknowledged).toBe(false);
  });

  it("same-millisecond writes: the later write wins whatever order the rows arrive in", () => {
    const filled = entry("contents");
    const markedNa = { ...na("contents"), createdAt: filled.createdAt };
    for (const rows of [[filled, markedNa], [markedNa, filled]]) {
      const contents = status(rows).sections.find((s) => s.sectionId === "contents")!;
      expect(contents.state).toBe("na");
    }
    const naFirst = na("contents");
    const thenFilled = { ...entry("contents"), createdAt: naFirst.createdAt };
    for (const rows of [[naFirst, thenFilled], [thenFilled, naFirst]]) {
      const contents = status(rows).sections.find((s) => s.sectionId === "contents")!;
      expect(contents.state).toBe("filled");
    }
  });

  it("each section carries its saved words in write order; N/A clears them", () => {
    const rows = [entry("contents", "First note"), entry("contents", "Second note"), entry("structure", "Kept"), na("structure")];
    const sections = status(rows).sections;
    expect(sections.find((s) => s.sectionId === "contents")!.notes).toEqual(["First note", "Second note"]);
    expect(sections.find((s) => s.sectionId === "structure")!.notes).toEqual([]);
  });

  it("a row with no write sequence never decides a section", () => {
    const unsequenced = { ...entry("contents"), seq: 0 };
    expect(status([unsequenced]).started).toBe(false);
  });

  it("an entry fills its section; N/A with a reason marks it N/A", () => {
    const s = status([entry("structure"), na("services")]);
    const byId = Object.fromEntries(s.sections.map((x) => [x.sectionId, x]));
    expect(byId.structure.state).toBe("filled");
    expect(byId.services.state).toBe("na");
    expect(byId.services.naReason).toBe("No gas connected to this property");
    expect(s.started).toBe(true);
  });

  it("a blank N/A reason is ignored and the section stays To do", () => {
    const s = status([na("services", "   ")]);
    expect(s.sections.find((x) => x.sectionId === "services")!.state).toBe("todo");
    expect(s.started).toBe(false);
  });

  it("newest observation wins within a section, in either direction", () => {
    const filledThenNa = status([entry("contents"), na("contents")]);
    expect(filledThenNa.sections.find((x) => x.sectionId === "contents")!.state).toBe("na");
    const naThenFilled = status([na("contents"), entry("contents")]);
    expect(naThenFilled.sections.find((x) => x.sectionId === "contents")!.state).toBe("filled");
  });

  it("orders by createdAt, not by array order", () => {
    const first = entry("contents");
    const second = na("contents");
    const s = status([second, first]);
    expect(s.sections.find((x) => x.sectionId === "contents")!.state).toBe("na");
  });

  it("unknown section ids and malformed rows are ignored", () => {
    const s = status([
      entry("not_a_section"),
      { ...entry("structure"), parsed: { sectionId: "structure" } },
    ]);
    expect(s.started).toBe(false);
  });

  it("rows from two sessions count as one walkthrough", () => {
    const half = FIRE_SECTION_IDS.slice(0, 5).map((id) => entry(id));
    const rest = FIRE_SECTION_IDS.slice(5).map((id) => na(id));
    const s = status([...half, ...rest]);
    expect(s.openSectionIds).toEqual([]);
    expect(s.canSignOff).toBe(true);
  });

  it("signed when the sign-off covers the newest section observation", () => {
    const rows = allFilled();
    const s = status([...rows, signoff(rows)]);
    expect(s.signoff.state).toBe("signed");
    expect(s.signoff.typedName).toBe("Sam Example");
  });

  it("a section change after sign-off makes it Changed (unsigned)", () => {
    const rows = allFilled();
    const s = status([...rows, signoff(rows), entry("contents", "Found more items")]);
    expect(s.signoff.state).toBe("changed");
  });

  it("a sign-off whose coversThrough is older than the newest section is Changed", () => {
    const rows = allFilled();
    const s = status([...rows, signoff(rows.slice(0, 1))]);
    expect(s.signoff.state).toBe("changed");
  });

  it("an uncovered edit stamped with the covered time (coversThrough) is Changed", () => {
    const rows = allFilled();
    const signed = signoff(rows);
    // Same millisecond as the newest covered row, which is coversThrough.
    const late = { ...entry("contents", "Found more items"), createdAt: lastAt(rows) };
    expect(status([...rows, signed, late]).signoff.state).toBe("changed");
    expect(status([...rows, late, signed]).signoff.state).toBe("changed");
  });

  it("newestSectionObservationAt ignores notice and sign-off rows", () => {
    const rows = [entry("structure")];
    const at = newestSectionObservationAt([...rows, notice()]);
    expect(at).toBe((rows[0].createdAt as Date).toISOString());
    expect(newestSectionObservationAt([notice()])).toBeNull();
  });
});
