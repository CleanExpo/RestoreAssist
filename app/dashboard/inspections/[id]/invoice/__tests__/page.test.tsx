// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("InspectionInvoicePage", () => {
  beforeEach(() => {
    toastError.mockReset();
  });

  it("renders a structured invoice-generation error as text without crashing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoice: null }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            code: "VALIDATION_ERROR",
            message: "No selected scope items available for invoicing",
            eventId: "evt_mock",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      render(
        <InspectionInvoicePage
          params={Promise.resolve({ id: "inspection_mock" })}
        />,
      );
    });

    const generateButtons = await screen.findAllByRole("button", {
      name: "Generate Invoice",
    });
    fireEvent.click(generateButtons[0]);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "No selected scope items available for invoicing",
      ),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/inspections/inspection_mock/generate-invoice",
      { method: "POST" },
    );
    expect(screen.getByText("No invoice generated yet")).toBeInTheDocument();
  });
});
