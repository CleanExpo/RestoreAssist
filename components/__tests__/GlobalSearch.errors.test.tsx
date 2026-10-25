// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import GlobalSearch from "../GlobalSearch";

const found = {
  ok: true,
  json: async () => ({
    results: {
      reports: [
        { id: "r1", type: "report", title: "Smith water damage", url: "/r/1" },
      ],
      clients: [],
      inspections: [],
    },
  }),
};

beforeEach(() => vi.restoreAllMocks());

describe("GlobalSearch failures (RA-8085)", () => {
  it.each([
    [
      "a non-ok response",
      () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
    ],
    ["a thrown fetch", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("shows a search error and clears old results on %s", async (_, fail) => {
    const f = vi.fn().mockResolvedValueOnce(found).mockImplementationOnce(fail);
    vi.stubGlobal("fetch", f);
    render(<GlobalSearch open />);
    const input = screen.getByPlaceholderText(/Search reports/);

    fireEvent.change(input, { target: { value: "smi" } });
    expect(await screen.findByText("Smith water damage")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "jones" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Search failed, try again.",
    );
    expect(screen.queryByText(/No results found/)).not.toBeInTheDocument();
    expect(screen.queryByText("Smith water damage")).not.toBeInTheDocument();
  });

  it("ignores a slow failure from an earlier keystroke", async () => {
    let failOld: (v: unknown) => void = () => {};
    const f = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (failOld = resolve)),
      )
      .mockResolvedValueOnce(found);
    vi.stubGlobal("fetch", f);
    render(<GlobalSearch open />);
    const input = screen.getByPlaceholderText(/Search reports/);

    fireEvent.change(input, { target: { value: "sm" } });
    fireEvent.change(input, { target: { value: "smi" } });
    expect(await screen.findByText("Smith water damage")).toBeInTheDocument();

    await act(async () => {
      failOld({ ok: false, status: 500, json: async () => ({}) });
    });
    expect(screen.getByText("Smith water damage")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
