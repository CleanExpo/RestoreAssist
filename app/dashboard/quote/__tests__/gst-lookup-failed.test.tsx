// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * RA-7743 — a failed GST lookup must stop the quote's invoice draft.
 *
 * The quote's own GST comes from /api/calculate (tenant country, server side),
 * but Create Invoice Draft builds its lines with useOrganizationGst()'s rate,
 * which starts at the AU default and reports `failed` when /api/gst-treatment
 * cannot be read (RA-7725). This page ignored `failed`, so an NZ business whose
 * lookup failed got an invoice draft at Australian 10% GST.
 *
 * Sabotage: drop `!gstFailed` from `gstKnown` — the failed-lookup test goes red.
 */

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import QuotePage from "../page";

const QUOTE = {
  quoteNumber: "QTE-7743",
  quoteDate: new Date().toISOString(),
  jobType: "Water Damage Restoration",
  standardApplied: "",
  applicableStandards: [],
  safety: { mouldActive: false, airMoverQty: 4, advisories: [] },
  contractor: { businessName: "Synthetic Co", abn: "", address: "", phone: "", email: "", logo: "" },
  client: { name: "Synthetic Client", address: "1 Test St", phone: "", email: "client@example.com" },
  lineItems: [{ description: "Labour", qty: 10, unit: "hr", rate: 100, subtotal: 1000 }],
  subtotalExGST: 1000,
  gst: 150,
  totalIncGST: 1150,
  minimumApplied: false,
  minimumChargeAmount: 0,
  pricingSource: "default_rates",
  pricingNote: "",
  jobDescription: "",
};

function mockFetch(gst: "fail" | "NZ") {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/gst-treatment") {
      return gst === "fail"
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ data: { country: "NZ" } }) };
    }
    if (url === "/api/calculate") {
      return { ok: true, status: 200, json: async () => QUOTE };
    }
    if (url === "/api/invoices") {
      return { ok: true, status: 201, json: async () => ({ invoice: { id: "inv_7743" } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function calculate() {
  fireEvent.click(screen.getAllByText(/Water Damage/i)[0]);
  await waitFor(() => expect(screen.getByText(/Calculate/i)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Calculate/i));
  await waitFor(() => expect(screen.getByText(/Quote Generated/i)).toBeInTheDocument());
}

function invoiceCalls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/invoices");
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("RA-7743 quote page — GST lookup", () => {
  it("on a failed lookup shows the error and cannot create an invoice draft", async () => {
    const fetchMock = mockFetch("fail");
    render(<QuotePage />);
    await calculate();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn.t load your GST settings/i,
    );
    const draft = screen.getByRole("button", { name: /Create Invoice Draft/i });
    expect(draft).toBeDisabled();
    fireEvent.click(draft);
    expect(invoiceCalls(fetchMock)).toHaveLength(0);
  });

  it("with the tenant's treatment loaded drafts the invoice at the tenant's rate", async () => {
    const fetchMock = mockFetch("NZ");
    render(<QuotePage />);
    await calculate();

    const draft = screen.getByRole("button", { name: /Create Invoice Draft/i });
    await waitFor(() => expect(draft).not.toBeDisabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(draft);

    await waitFor(() => expect(invoiceCalls(fetchMock)).toHaveLength(1));
    const body = JSON.parse(String((invoiceCalls(fetchMock)[0][1] as RequestInit).body));
    expect(body.lineItems.map((li: { gstRate: number }) => li.gstRate)).toEqual([15]);
  });
});
