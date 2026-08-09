// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

import InvoiceVariationsPage from "../page";

describe("InvoiceVariationsPage", () => {
  beforeEach(() => {
    routerPush.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("shows the nested API validation message when variation creation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          if (url === "/api/invoices/invoice_mock" && !init?.method) {
            return {
              ok: true,
              json: async () => ({
                id: "invoice_mock",
                invoiceNumber: "RA-2026-0001",
                status: "SENT",
                totalIncGST: 11000,
                customerName: "Mock Customer",
                customerEmail: "mock@example.test",
                invoiceDate: "2026-08-10T00:00:00.000Z",
                dueDate: "2026-09-09T00:00:00.000Z",
                lineItems: [{ gstRate: 10 }],
              }),
            };
          }
          if (
            url === "/api/invoices/invoice_mock/variations" &&
            !init?.method
          ) {
            return {
              ok: true,
              json: async () => ({ variations: [] }),
            };
          }
          if (
            url === "/api/invoices/invoice_mock/variations" &&
            init?.method === "POST"
          ) {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                error: {
                  code: "VALIDATION",
                  message: "Variation amount exceeds the permitted adjustment",
                  eventId: "evt_variation_mock",
                },
              }),
            };
          }
          throw new Error(`Unexpected request: ${url}`);
        },
      );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      render(
        <InvoiceVariationsPage
          params={Promise.resolve({ id: "invoice_mock" })}
        />,
      );
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Create Variation" }),
    );
    fireEvent.change(
      screen.getByPlaceholderText("Describe the reason for this variation..."),
      { target: { value: "Additional drying equipment" } },
    );
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Variation" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Variation amount exceeds the permitted adjustment",
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
