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
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("flushes a non-empty specification body on blur without a later duplicate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(inspectionResponse())
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();

    const notes = await screen.findByPlaceholderText("Add notes…");
    fireEvent.change(notes, { target: { value: "Place behind skirting" } });
    fireEvent.blur(notes);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/inspections/inspection-1/scope-items/scope-1",
      expect.objectContaining({
        method: "PATCH",
        keepalive: true,
        body: JSON.stringify({ specification: "Place behind skirting" }),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("restores the displayed specification when the blur PATCH is rejected", async () => {
    const initialResponse = inspectionResponse();
    const responseBody = await initialResponse.json();
    responseBody.inspection.scopeItems[0].specification = "Original note";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => responseBody,
      })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();

    const notes = await screen.findByPlaceholderText("Add notes…");
    expect(notes).toHaveValue("Original note");
    fireEvent.change(notes, { target: { value: "Unsaved replacement" } });
    fireEvent.blur(notes);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Failed to save scope item. Changes were reverted.",
      ),
    );
    expect(notes).toHaveValue("Original note");
  });

  it("serializes an edit made while a specification PATCH is in flight", async () => {
    let resolveFirstPatch: ((response: { ok: boolean }) => void) | undefined;
    const firstPatch = new Promise<{ ok: boolean }>((resolve) => {
      resolveFirstPatch = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(inspectionResponse())
      .mockReturnValueOnce(firstPatch)
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();

    const notes = await screen.findByPlaceholderText("Add notes…");
    fireEvent.change(notes, { target: { value: "First draft" } });
    fireEvent.blur(notes);
    fireEvent.change(notes, { target: { value: "Latest draft" } });
    fireEvent.blur(notes);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      specification: "First draft",
    });

    resolveFirstPatch?.({ ok: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      specification: "Latest draft",
    });
  });
});
