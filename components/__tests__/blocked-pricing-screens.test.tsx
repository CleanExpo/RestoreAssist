// @vitest-environment jsdom
/**
 * RA-8281 (B2): what a contractor sees when a pricing engine answers with a
 * blocked result. The notice lists every line; a line whose rate is not set
 * reads "Rate not set" with the national range when one exists and has no
 * amount; the total reads "Total not available: rate not set".
 *
 * The two document screens are driven through their real Generate button
 * with the body blockedPricingResponse sends, so the screen and the route
 * answer are tested as a pair.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  blockedPricing,
  TOTAL_NOT_AVAILABLE_NOTE,
  type BlockedPricing,
} from "@/lib/pricing/blocked-line";
import { BlockedPricingNotice } from "@/components/pricing/BlockedPricingNotice";
import CostEstimationViewer from "../CostEstimationViewer";
import ScopeOfWorksViewer from "../ScopeOfWorksViewer";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("react-hot-toast", () => ({
  default: { error: toastError, success: vi.fn() },
}));

const BLOCKED: BlockedPricing = blockedPricing(
  [
    {
      description: "Labour: Master technician",
      quantity: 4,
      unit: "hr",
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      rateField: "masterQualifiedNormalHours",
      pricingNote: "Rate not set. Set masterQualifiedNormalHours in your price list.",
      nationalRange: { min: 60, max: 170, unit: "$/hr" },
    },
    {
      description: "Fire: Debris removal",
      quantity: 12,
      unit: "m²",
      rate: null,
      subtotal: null,
      pricingStatus: "rate_not_set",
      rateField: "rateFireDebrisRemoval",
      pricingNote: "Rate not set. Set rateFireDebrisRemoval in your price list.",
      nationalRange: null,
    },
    {
      description: "Equipment: saved line",
      quantity: null,
      unit: null,
      rate: null,
      subtotal: null,
      pricingStatus: "unusable_line",
      pricingNote: "This saved equipment line cannot be priced.",
    },
    {
      description: "Administration fee",
      quantity: 1,
      unit: null,
      rate: 70,
      subtotal: 70,
      pricingStatus: "priced",
    },
  ],
  [],
);

function rowFor(container: HTMLElement, text: string): HTMLElement {
  const row = Array.from(container.querySelectorAll("tbody tr")).find((tr) =>
    (tr.textContent ?? "").includes(text),
  );
  if (!row) throw new Error(`no row for ${text}`);
  return row as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockClear();
});

describe("BlockedPricingNotice", () => {
  it("a line with a national range reads Rate not set with the range and no amount", () => {
    const { container } = render(
      <BlockedPricingNotice blocked={BLOCKED} title="Cost estimate" />,
    );
    const cells = rowFor(container, "Master technician").querySelectorAll("td");
    expect(cells[2].textContent).toBe(
      "Rate not set (national range $60-$170 per hr)",
    );
    expect(cells[3].textContent).toBe("—");
  });

  it("a line with no national range reads Rate not set and nothing else", () => {
    const { container } = render(
      <BlockedPricingNotice blocked={BLOCKED} title="Cost estimate" />,
    );
    const cells = rowFor(container, "Debris removal").querySelectorAll("td");
    expect(cells[2].textContent).toBe("Rate not set");
    expect(cells[3].textContent).toBe("—");
  });

  it("a saved line that cannot be priced shows its reason and no amount", () => {
    const { container } = render(
      <BlockedPricingNotice blocked={BLOCKED} title="Cost estimate" />,
    );
    const cells = rowFor(container, "saved line").querySelectorAll("td");
    expect(cells[2].textContent).toBe(
      "This saved equipment line cannot be priced.",
    );
    expect(cells[3].textContent).toBe("—");
  });

  it("the total is blocked, and no blocked line or total shows a dollar amount", () => {
    const { container } = render(
      <BlockedPricingNotice blocked={BLOCKED} title="Cost estimate" />,
    );
    expect(container.querySelector("tfoot")?.textContent).toBe(
      `Total${TOTAL_NOT_AVAILABLE_NOTE}`,
    );
    for (const row of container.querySelectorAll(
      'tr[data-pricing-status="rate_not_set"] td:last-child, tr[data-pricing-status="unusable_line"] td:last-child, tfoot td',
    )) {
      expect(row.textContent).not.toMatch(/\d/);
    }
    expect(container.textContent).not.toMatch(/\$0\.00/);
  });

  const only = (status: string) =>
    blockedPricing(
      BLOCKED.lines.filter(
        (l) => l.pricingStatus === status || l.pricingStatus === "priced",
      ),
      [],
    );
  const instructions = (blocked: BlockedPricing) =>
    render(<BlockedPricingNotice blocked={blocked} title="Cost estimate" />)
      .container.querySelector('[data-testid="blocked-pricing-instructions"]')
      ?.textContent ?? "";

  it("a saved line that cannot be priced is to be corrected, not sent to the price list", () => {
    const text = instructions(only("unusable_line"));
    expect(text).toContain("Correct the saved equipment lines marked below");
    expect(text).not.toContain("price list");
    expect(text).toContain("Nothing has been saved.");
  });

  it("a rate that is not set is to be set in the price list, with no equipment instruction", () => {
    const text = instructions(only("rate_not_set"));
    expect(text).toContain("Set the rates marked below in your price list");
    expect(text).not.toContain("saved equipment lines");
    expect(text).toContain("Nothing has been saved.");
  });

  it("a result with both kinds of blocked line gives both instructions", () => {
    const text = instructions(BLOCKED);
    expect(text).toContain("Set the rates marked below in your price list");
    expect(text).toContain("Correct the saved equipment lines marked below");
  });

  it("control: a priced line shows its own rate and amount", () => {
    const { container } = render(
      <BlockedPricingNotice blocked={BLOCKED} title="Cost estimate" />,
    );
    const cells = rowFor(container, "Administration fee").querySelectorAll("td");
    expect(cells[2].textContent).toBe("$70.00");
    expect(cells[3].textContent).toBe("$70.00");
  });
});

/** fetch for a document screen: the report loads, Generate answers `generate`. */
function stubFetch(generate: { ok: boolean; status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      if (init?.method === "POST") {
        return {
          ok: generate.ok,
          status: generate.status,
          statusText: "",
          json: async () => generate.body,
        };
      }
      return { ok: true, status: 200, json: async () => ({ id: "r1" }) };
    }),
  );
}

describe.each([
  ["CostEstimationViewer", CostEstimationViewer, /Generate Cost Estimation/],
  ["ScopeOfWorksViewer", ScopeOfWorksViewer, /Generate Scope of Works/],
])("%s", (_name, Viewer, button) => {
  it("a blocked answer is shown line by line, not as an error toast", async () => {
    stubFetch({
      ok: false,
      status: 422,
      body: {
        error: { code: "RATE_NOT_SET", message: TOTAL_NOT_AVAILABLE_NOTE },
        blocked: BLOCKED,
      },
    });
    render(<Viewer reportId="r1" />);
    fireEvent.click(await screen.findByRole("button", { name: button }));
    const notice = await screen.findByTestId("blocked-pricing");
    expect(notice.textContent).toContain(
      "Rate not set (national range $60-$170 per hr)",
    );
    expect(notice.textContent).toContain(TOTAL_NOT_AVAILABLE_NOTE);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("control: any other failure is still an error and shows no blocked lines", async () => {
    stubFetch({
      ok: false,
      status: 500,
      body: { error: "Something went wrong" },
    });
    render(<Viewer reportId="r1" />);
    fireEvent.click(await screen.findByRole("button", { name: button }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith("Something went wrong");
    expect(screen.queryByTestId("blocked-pricing")).toBeNull();
  });
});
