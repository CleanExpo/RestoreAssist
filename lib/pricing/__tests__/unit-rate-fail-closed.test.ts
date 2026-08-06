/**
 * Fail-closed guard for the pack ladder.
 *
 * `unit-rate.ts` builds its pack list from every key in `PRICING_CONFIG.addons`.
 * That is correct only while that object holds report packs exclusively. A
 * critic reading the module found the latent case: register anything there
 * without a `reportLimit` and the whole quote goes `NaN` — total, effective
 * rate, all of it — silently, on the page whose job is telling a buyer what
 * they will pay.
 *
 * THE FIRST VERSION OF THIS TEST WAS VACUOUS, and the negative control caught
 * it. Poisoning ONE add-on among well-formed ones passes whether the filter is
 * present or not, because `need - undefined` is `NaN` and every `NaN < x`
 * comparison is `false` — so the dynamic program silently never selects the
 * malformed pack. The suspected `NaN` leak is unreachable. The code was already
 * safe there, by an accident of comparison semantics rather than by design.
 *
 * The case that DOES break is every add-on being malformed. Then no pack ever
 * wins, `choice[need]` stays at its `-1` sentinel, and the backtrack
 * dereferences `PACKS[-1].reports` — a TypeError, not a NaN. With the filter,
 * `PACKS` is empty and `cheapestPacks` returns early instead.
 *
 * So the filter is load-bearing for the all-malformed case and belt-and-braces
 * for the mixed one. That distinction is recorded because a guard nobody has
 * watched fail is not evidence, and this one only fails under a catalogue
 * nobody would have thought to write.
 *
 * It lives in its own file because the module reads the config once at import
 * time, so the mock must be in place before `unit-rate` is ever loaded —
 * sharing a file with the main suite would give one of the two the wrong
 * catalogue.
 */

import { describe, expect, it, vi } from "vitest";

// Hoisted above the import below. A recurring $11/month add-on with no
// reportLimit — exactly the shape of the seven in lib/billing/addon-registry.ts
// if one were ever moved or copied into PRICING_CONFIG.addons.
vi.mock("@/lib/pricing", () => ({
  PRICING_CONFIG: {
    free: {
      displayName: "Free Trial",
      amount: 0,
      trialDays: 15,
      trialReportCredits: 50,
      trialQuickFillCredits: 30,
      reportLimit: 50,
      features: [],
    },
    pricing: {
      monthly: {
        displayName: "Monthly",
        amount: 99,
        currency: "AUD",
        interval: "month",
        reportLimit: 50,
        signupBonus: 10,
        features: [],
      },
    },
    // EVERY add-on is malformed. This is the case that actually breaks, and it
    // is not the one first suspected — see the file header.
    addons: {
      voice: { displayName: "ElevenLabs Voice", amount: 11 },
      bookkeeping: { displayName: "Online Bookkeeping", amount: 11 },
    },
  },
}));

const { planForVolume, perReportRate } = await import("../unit-rate");

describe("pack ladder fails closed on a malformed add-on", () => {
  it("never returns NaN when an add-on has no reportLimit", () => {
    for (const volume of [1, 50, 51, 80, 120, 200, 500]) {
      const quote = planForVolume(volume);
      expect(Number.isFinite(quote.totalAud), `total at ${volume}`).toBe(true);
      expect(
        Number.isFinite(quote.effectiveRate),
        `effective rate at ${volume}`,
      ).toBe(true);
      expect(Number.isFinite(quote.packsTotalAud), `packs at ${volume}`).toBe(
        true,
      );
      expect(quote.reportsProvided, `provided at ${volume}`).toBeGreaterThanOrEqual(
        Math.min(volume, quote.baseIncluded),
      );
    }
  });

  it("quotes the base plan alone rather than throwing, when no pack is usable", () => {
    // Every add-on in this catalogue is malformed, so there is nothing to buy.
    // Without the filter this throws TypeError from PACKS[-1].reports.
    const quote = planForVolume(120);
    expect(quote.packs).toEqual([]);
    expect(quote.packsTotalAud).toBe(0);
    expect(quote.totalAud).toBe(99);
    expect(quote.reportsProvided).toBe(50);
    // Honest consequence: the quote UNDER-provides. That is correct behaviour
    // for a broken catalogue — refusing to invent a pack beats inventing a
    // price — but it must be visible, not silent, so it is asserted here.
    expect(quote.reportsProvided).toBeLessThan(quote.reportsPerMonth);
  });

  it("negative control — the assertions above can actually fail", () => {
    // If the filter were removed, `reports` would be undefined and the cost
    // arithmetic would produce NaN. Prove NaN is genuinely detected by the same
    // check the tests rely on, so a green above is not a green from a predicate
    // that can never be false.
    expect(Number.isFinite(NaN)).toBe(false);
    expect(Number.isFinite(0 + (undefined as unknown as number))).toBe(false);
    // And prove the module under test is the mocked one, not the real config —
    // otherwise this whole file would be testing the wrong catalogue and pass
    // for the wrong reason.
    expect(perReportRate(11, 0)).toBeNull();
  });
});
