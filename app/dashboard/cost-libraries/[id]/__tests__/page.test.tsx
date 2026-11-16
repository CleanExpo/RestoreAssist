// @vitest-environment jsdom
/**
 * RA-8395 row 1: the trash icon on a cost item must ask before it deletes.
 * CostItem has no deletedAt column, so the server delete is permanent.
 */
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import CostLibraryDetailPage from "../page";

const LIBRARY = {
  id: "lib1",
  name: "Brisbane rates",
  region: "QLD",
  isDefault: false,
  items: [
    {
      id: "item1",
      category: "Drying",
      description: "Dehumidifier hire per day",
      rate: 55,
      unit: "day",
      createdAt: "2026-11-01T00:00:00.000Z",
    },
  ],
  _count: { items: 1 },
};

let fetchMock: ReturnType<typeof vi.fn>;

function deleteCalls() {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
  );
}

async function renderPage() {
  const params = Promise.resolve({ id: "lib1" });
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <CostLibraryDetailPage params={params} />
      </Suspense>,
    );
  });
  await screen.findByText("Dehumidifier hire per day");
}

beforeEach(() => {
  vi.restoreAllMocks();
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({ library: LIBRARY }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("cost library item delete (RA-8395)", () => {
  it("asks first, naming the item; Cancel sends no DELETE and keeps the row", async () => {
    await renderPage();
    fireEvent.click(screen.getByTitle("Delete item"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Dehumidifier hire per day");
    expect(deleteCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(deleteCalls()).toHaveLength(0);
    expect(screen.getByText("Dehumidifier hire per day")).toBeInTheDocument();
  });

  it("Confirm sends exactly one DELETE for that item", async () => {
    await renderPage();
    fireEvent.click(screen.getByTitle("Delete item"));
    await screen.findByRole("alertdialog");

    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(deleteCalls()[0][0]).toBe("/api/cost-items/item1");
    await waitFor(() =>
      expect(screen.queryByText("Dehumidifier hire per day")).not.toBeInTheDocument(),
    );
  });
});
