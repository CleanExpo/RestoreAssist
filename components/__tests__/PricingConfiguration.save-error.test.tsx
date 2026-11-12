// @vitest-environment jsdom
/**
 * RA-8281 B1 review round 2: clearing a rate and saving must show a clear,
 * readable refusal. The PUT answers with the structured error envelope
 * `{ error: { code, message, eventId } }`; passing that object to the toast
 * rendered nothing useful.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/capacitor/BillingGate", () => ({
  default: () => null,
}));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));

import PricingConfiguration from "@/components/PricingConfiguration";
import { BASE_RATE_FIELDS } from "@/lib/pricing/rate-not-set";
import { expectNoRangeFigure } from "@/lib/pricing/__tests__/no-range-figure";

const SAVED = { id: "pc1", callOutFee: 150, administrationFee: 250 };

function mockFetch(putBody: unknown, putStatus = 400) {
  const calls: { url: string; body?: unknown }[] = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url === "/api/user/profile") {
      return new Response(
        JSON.stringify({ profile: { subscriptionStatus: "ACTIVE" } }),
      );
    }
    if (url === "/api/pricing-config" && init?.method === "PUT") {
      return new Response(
        typeof putBody === "string" ? putBody : JSON.stringify(putBody),
        { status: putStatus },
      );
    }
    return new Response(JSON.stringify({ pricingConfig: SAVED }));
  }) as unknown as typeof fetch;
  return calls;
}

async function clearCallOutFeeAndSave() {
  render(<PricingConfiguration />);
  const input = await screen.findByDisplayValue("150");
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: /save configuration/i }));
}

beforeEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
});
afterEach(() => cleanup());

describe("price-list save refusal (RA-8281 B1)", () => {
  it("a cleared rate is sent as null and the structured refusal names the rate in plain text", async () => {
    const calls = mockFetch({
      error: {
        code: "VALIDATION",
        message: "Missing required field: callOutFee",
        eventId: "evt_1",
      },
    });
    await clearCallOutFeeAndSave();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

    const put = calls.find((c) => c.body !== undefined);
    expect((put?.body as Record<string, unknown>).callOutFee).toBeNull();

    const shown = toastError.mock.calls[0][0];
    expect(typeof shown).toBe("string");
    expect(shown).toContain("Call-Out Fee");
    expect(shown).toMatch(/no rate set/i);
  });

  it("control: a flat string error (the NRPG range refusal) is shown as sent", async () => {
    mockFetch({
      error:
        "Call-Out Fee rate $90.00 is outside the national price range",
      field: "callOutFee",
    });
    await clearCallOutFeeAndSave();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toContain(
      "outside the national price range",
    );
  });

  it("the settings screen's own words show no range figure (RA-8281 step 1)", async () => {
    // What the screen says, as opposed to the rates in its inputs (those are
    // the contractor's own figures): every text node, and every hint an
    // input carries. Checked for all 23 rates, after a range refusal.
    // $93.70 stands for the contractor's own figure: it is no rate's bound.
    mockFetch({
      error: "Call-Out Fee rate $93.70 is outside the national price range",
      field: "callOutFee",
    });
    await clearCallOutFeeAndSave();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));

    const hints = Array.from(document.body.querySelectorAll("*")).flatMap(
      (el) =>
        ["placeholder", "title", "aria-label", "aria-description"].map(
          (attr) => el.getAttribute(attr) ?? "",
        ),
    );
    const words = [
      document.body.textContent ?? "",
      ...hints,
      String(toastError.mock.calls[0][0]),
    ].join("\n");
    expect(words).toContain("Call-Out Fee");
    for (const field of BASE_RATE_FIELDS) expectNoRangeFigure(words, field);
  });

  it("control: an unreadable error body still shows a readable message", async () => {
    mockFetch("not json at all", 500);
    await clearCallOutFeeAndSave();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(typeof toastError.mock.calls[0][0]).toBe("string");
  });
});
