// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RA-7710 — on a signed job, Generate Invoice POSTs
 * /api/inspections/<id>/generate-invoice and production answers
 *   409 {"error":{"code":"CONFLICT","message":"A linked report is required before generating an invoice."}}
 * and the operator sees nothing. The reason and the way forward must be on the
 * page, not only in a toast that disappears after four seconds.
 *
 * Sabotage: remove the inline error block — both tests go red.
 */

const toastError = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import InspectionInvoicePage from "../page";

const CONFLICT = {
  error: {
    code: "CONFLICT",
    message: "A linked report is required before generating an invoice.",
  },
};

async function renderPage() {
  await act(async () => {
    render(<InspectionInvoicePage params={Promise.resolve({ id: "insp_7710" })} />);
  });
}

beforeEach(() => {
  toastError.mockReset();
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
    "11111111-1111-4111-8111-111111111111",
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RA-7710 inspection invoice — Generate Invoice says why not", () => {
  it("on a 409 shows 'linked report is required' on the page with a Generate report first control", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ invoice: null }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => CONFLICT });
    vi.stubGlobal("fetch", fetchMock);
    await renderPage();

    const [button] = await screen.findAllByRole("button", { name: "Generate Invoice" });
    fireEvent.click(button);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/inspections/insp_7710/generate-invoice",
      expect.objectContaining({ method: "POST" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/linked report is required/i);

    const next = screen.getByRole("link", { name: /Generate report first/i });
    expect(next).toHaveAttribute("href", "/dashboard/reports/new?inspectionId=insp_7710");
  });

  it("fail-loud: a network failure still leaves a visible message on the page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ invoice: null }) })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await renderPage();

    const [button] = await screen.findAllByRole("button", { name: "Generate Invoice" });
    fireEvent.click(button);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not generate the invoice/i);
  });
});
