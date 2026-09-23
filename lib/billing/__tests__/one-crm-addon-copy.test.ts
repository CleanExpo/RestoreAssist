/**
 * RA-7660 (One CRM, Unit A1) — what the add-on registry sells.
 *
 * RECURRING_ADDONS is the single source for both the public pricing page
 * (components/pricing/CostDisclosure.tsx renders every descriptor, unfiltered)
 * and the in-app add-ons page (app/api/addons/catalog). So with the listing
 * switches off, no descriptor may name NRPG, ServiceM8, MYOB or QuickBooks —
 * and no name or price may move.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const LISTING_FLAGS = [
  "NEXT_PUBLIC_NRPG_ENABLED",
  "NEXT_PUBLIC_SERVICEM8_ENABLED",
  "NEXT_PUBLIC_MYOB_ENABLED",
  "NEXT_PUBLIC_QUICKBOOKS_ENABLED",
  "NEXT_PUBLIC_IMPORT_DATA_ENABLED",
] as const;

async function loadRegistry(env: Partial<Record<(typeof LISTING_FLAGS)[number], string>>) {
  for (const name of LISTING_FLAGS) vi.stubEnv(name, env[name] ?? "");
  vi.resetModules();
  return import("../addon-registry");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("recurring add-on copy with every listing switch off", () => {
  it("no descriptor names NRPG, ServiceM8, MYOB or QuickBooks", async () => {
    const { RECURRING_ADDONS } = await loadRegistry({});
    const text = Object.values(RECURRING_ADDONS)
      .map((a) => `${a.name}\n${a.description}`)
      .join("\n");
    expect(text).not.toMatch(/NRPG|ServiceM8|MYOB|QuickBooks/i);
  });

  it("the Bookkeeping add-on names Xero only", async () => {
    const { RECURRING_ADDONS } = await loadRegistry({});
    expect(RECURRING_ADDONS.BOOKKEEPING.description).toBe(
      "Connect and sync Xero.",
    );
  });

  it("the Service CRM add-on drops DR-NRPG and keeps its name and $11 price", async () => {
    const { RECURRING_ADDONS } = await loadRegistry({});
    const serviceCrm = RECURRING_ADDONS.SERVICE_CRM;
    expect(serviceCrm.description).toBe(
      "Connect Ascora to sync jobs and pricing data.",
    );
    expect(serviceCrm.name).toBe("Service CRM Connection");
    expect(serviceCrm.amount).toBe(11);
    expect(serviceCrm.currency).toBe("AUD");
    expect(serviceCrm.interval).toBe("month");
    expect(serviceCrm.subscriptionType).toBe("service_crm_addon");
  });

  it("no add-on price, interval or subscription marker changed", async () => {
    const { RECURRING_ADDONS } = await loadRegistry({});
    const prices = Object.fromEntries(
      Object.values(RECURRING_ADDONS).map((a) => [
        a.sku,
        `${a.amount} ${a.currency}/${a.interval} ${a.subscriptionType}`,
      ]),
    );
    expect(prices).toEqual({
      FLOORPLAN_UNDERLAY: "9.95 AUD/month floorplan_underlay_addon",
      BOOKKEEPING: "11 AUD/month bookkeeping_addon",
      SERVICE_CRM: "11 AUD/month service_crm_addon",
      PAYMENTS: "11 AUD/month payments_addon",
      CLIENT_COMMS: "11 AUD/month client_comms_addon",
      VOICE: "11 AUD/month voice_addon",
      TECHNICIAN_SEATS: "11 AUD/month technician_seats_addon",
      CLIENT_EDUCATION: "11 AUD/month client_education_addon",
      AI_COPILOT: "11 AUD/month ai_copilot_addon",
    });
  });
});

describe("the Bookkeeping add-on names a provider again once its switch is on", () => {
  it("MYOB and QuickBooks both on", async () => {
    const { RECURRING_ADDONS } = await loadRegistry({
      NEXT_PUBLIC_MYOB_ENABLED: "true",
      NEXT_PUBLIC_QUICKBOOKS_ENABLED: "true",
    });
    expect(RECURRING_ADDONS.BOOKKEEPING.description).toBe(
      "Connect and sync Xero, QuickBooks or MYOB.",
    );
  });

  it.each([
    [false, false, "Connect and sync Xero."],
    [true, false, "Connect and sync Xero or QuickBooks."],
    [false, true, "Connect and sync Xero or MYOB."],
    [true, true, "Connect and sync Xero, QuickBooks or MYOB."],
  ])(
    "bookkeepingAddonDescription(quickbooks=%s, myob=%s) reads %j",
    async (quickbooks, myob, expected) => {
      const mod = (await import("../bookkeeping-addon")) as Record<
        string,
        unknown
      >;
      const describeFn = mod.bookkeepingAddonDescription as (flags: {
        quickbooks: boolean;
        myob: boolean;
      }) => string;
      expect(describeFn({ quickbooks, myob })).toBe(expected);
    },
  );
});
