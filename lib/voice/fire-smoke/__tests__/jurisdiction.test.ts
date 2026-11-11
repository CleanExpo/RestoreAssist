import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { checkFireSubmitGate, isFireWalkthroughApplicable, loadFireWalkthrough, type FireDb } from "../server";
import { entry, resetClock } from "./helpers";
import type { FireObservationRow } from "../schema";

function dbWith(rows: FireObservationRow[]): FireDb {
  return {
    voiceCopilotObservation: {
      async findMany() {
        return rows.map((r) => ({ ...r, sessionId: "s1" }));
      },
    },
  };
}

let warn: MockInstance;
beforeEach(() => {
  resetClock();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const VIC = { propertyCountry: "AU", propertyPostcode: "3000" };
const NSW = { propertyCountry: "AU", propertyPostcode: "2000" };
const NZ = { propertyCountry: "NZ", propertyPostcode: "1010" };
// Unknown location: every one of these must keep the walkthrough REQUIRED.
const UNKNOWN: Array<[string, Record<string, unknown>]> = [
  ["no location at all", {}],
  ["blank postcode", { propertyCountry: "AU", propertyPostcode: "" }],
  ["unparseable postcode", { propertyCountry: "AU", propertyPostcode: "abcd" }],
  ["unmapped postcode", { propertyCountry: "AU", propertyPostcode: "0100" }],
  ["letters before a Sydney postcode", { propertyCountry: "AU", propertyPostcode: "abc2000" }],
  ["letters after a Sydney postcode", { propertyCountry: "AU", propertyPostcode: "2000abc" }],
  ["five digits", { propertyCountry: "AU", propertyPostcode: "20000" }],
  ["spaces inside", { propertyCountry: "AU", propertyPostcode: "20 00" }],
  ["unknown country", { propertyCountry: "XX", propertyPostcode: "3000" }],
  ["missing country, non-VIC postcode", { propertyPostcode: "2000" }],
  ["null country, null postcode", { propertyCountry: null, propertyPostcode: null }],
];

describe("fire walkthrough applies only to Victorian inspections", () => {
  it("is applicable for a Victorian fire job", async () => {
    const loaded = await loadFireWalkthrough("i1", dbWith([]));
    expect(await isFireWalkthroughApplicable({ id: "i1", claimType: "FIRE", ...VIC }, loaded, dbWith([]))).toBe(true);
  });

  it.each([["NSW", NSW], ["New Zealand", NZ]])("is NOT applicable for a %s fire job", async (_n, loc) => {
    const loaded = await loadFireWalkthrough("i1", dbWith([]));
    expect(await isFireWalkthroughApplicable({ id: "i1", claimType: "FIRE", ...loc }, loaded, dbWith([]))).toBe(false);
  });

  it("is NOT applicable outside Victoria even when a walkthrough was started", async () => {
    const db = dbWith([entry("structure")]);
    const loaded = await loadFireWalkthrough("i1", db);
    expect(await isFireWalkthroughApplicable({ id: "i1", claimType: "FIRE", ...NZ }, loaded, db)).toBe(false);
  });

  it.each(UNKNOWN)("stays applicable (fails closed) with %s", async (_n, loc) => {
    const loaded = await loadFireWalkthrough("i1", dbWith([]));
    expect(await isFireWalkthroughApplicable({ id: "i1", claimType: "FIRE", ...loc }, loaded, dbWith([]))).toBe(true);
  });
});

describe("submit gate honours the same location rule", () => {
  it.each([["NSW", NSW], ["New Zealand", NZ]])("does not block a %s fire job", async (_n, loc) => {
    const result = await checkFireSubmitGate({ id: "i1", claimType: "FIRE", ...loc }, dbWith([entry("structure")]));
    expect(result.blocked).toBe(false);
  });

  it("still blocks a Victorian fire job with an unsigned walkthrough", async () => {
    const result = await checkFireSubmitGate({ id: "i1", claimType: "FIRE", ...VIC }, dbWith([entry("structure")]));
    expect(result.blocked).toBe(true);
  });

  it.each(UNKNOWN)("still blocks (fails closed) with %s", async (_n, loc) => {
    const result = await checkFireSubmitGate({ id: "i1", claimType: "FIRE", ...loc }, dbWith([entry("structure")]));
    expect(result.blocked).toBe(true);
  });
});
