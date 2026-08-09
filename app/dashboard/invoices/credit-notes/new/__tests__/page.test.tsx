// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import NewCreditNotePage from "../page";

describe("NewCreditNotePage", () => {
  beforeEach(() => {
    routerPush.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it("shows the nested API validation message when credit-note creation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          if (url === "/api/invoices?status=SENT,PAID&limit=100") {
            return {
              ok: true,
              json: async () => ({
                invoices: [
                  {
                    id: "invoice_mock",
                    invoiceNumber: "RA-2026-0001",
                    customerName: "Mock Customer",
                  },
                ],
              }),
            };
          }
          if (url === "/api/invoices/credit-notes" && init?.method === "POST") {
            return {
              ok: false,
              status: 422,
              json: async () => ({
                error: {
                  code: "VALIDATION",
                  message: "Credit amount exceeds the invoice balance",
                  eventId: "evt_credit_note_mock",
                },
              }),
            };
          }
          throw new Error(`Unexpected request: ${url}`);
        },
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<NewCreditNotePage />);

    const invoiceSelect = (await screen.findAllByRole("combobox"))[0];
    fireEvent.change(invoiceSelect, { target: { value: "invoice_mock" } });
    fireEvent.change(screen.getByPlaceholderText("Description"), {
      target: { value: "Pricing correction" },
    });
    fireEvent.change(screen.getByPlaceholderText("Unit price"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Issue Credit Note" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Credit amount exceeds the invoice balance",
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
