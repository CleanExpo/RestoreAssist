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

const toastError = vi.fn();
const router = { push: vi.fn() };

vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import ScopeItemsPage from "../page";

describe("ScopeItemsPage", () => {
  beforeEach(() => {
    toastError.mockReset();
  });

  function inspectionResponse() {
    return {
      ok: true,
      json: async () => ({
        inspection: {
          inspectionNumber: "NIR-MOCK-1",
          propertyAddress: "1 Mock Street",
          propertyPostcode: "4000",
          status: "DRAFT",
          affectedAreas: [],
          scopeItems: [
            {
              id: "scope-1",
              itemType: "drying-equipment",
              description: "Install air mover",
              quantity: 1,
              unit: "each",
              specification: null,
              justification: null,
              isRequired: true,
              isSelected: false,
              autoDetermined: false,
              areaId: null,
            },
          ],
        },
      }),
    };
  }

  async function renderPage() {
    const params = Promise.resolve({ id: "inspection-1" });
    await params;
    await act(async () => {
      render(<ScopeItemsPage params={params} />);
    });
  }

  it("reverts an optimistic selection when the PATCH request rejects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(inspectionResponse())
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();

    const selection = await screen.findByRole("checkbox");
    expect(selection).not.toBeChecked();
    fireEvent.click(selection);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Failed to save scope item. Changes were reverted.",
      ),
    );
    expect(selection).not.toBeChecked();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/inspections/inspection-1/scope-items/scope-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("restores the displayed quantity when a debounced PATCH rejects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(inspectionResponse())
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();

    const quantity = await screen.findByRole("spinbutton");
    fireEvent.change(quantity, { target: { value: "3" } });

    await waitFor(
      () =>
        expect(toastError).toHaveBeenCalledWith(
          "Failed to save scope item. Changes were reverted.",
        ),
      { timeout: 2_000 },
    );
    expect(quantity).toHaveValue(1);
  });
});
