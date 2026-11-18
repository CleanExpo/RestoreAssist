// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import GlobalSearch from "../GlobalSearch";

function reply(title: string, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({
      results: {
        reports: [{ id: title, type: "report", title, url: `/r/${title}` }],
        clients: [],
        inspections: [],
      },
    }),
  };
}

function typeInto(input: HTMLElement, text: string) {
  for (let i = 1; i <= text.length; i++) {
    fireEvent.change(input, { target: { value: text.slice(0, i) } });
    act(() => {
      vi.advanceTimersByTime(50);
    });
  }
}

async function settle(ms = 300) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function searchCalls(f: ReturnType<typeof vi.fn>) {
  return f.mock.calls
    .map(([u]) => String(u))
    .filter((u) => u.startsWith("/api/search"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GlobalSearch request rate (RA-8448)", () => {
  it("sends one /api/search request for a 10-character query typed quickly", async () => {
    const f = vi.fn().mockResolvedValue(reply("Smith water damage"));
    vi.stubGlobal("fetch", f);
    render(<GlobalSearch open />);
    const input = screen.getByPlaceholderText(/Search reports/);

    typeInto(input, "smith wate");
    await settle();

    const calls = searchCalls(f);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("q=smith%20wate");
    expect(screen.getByText("Smith water damage")).toBeInTheDocument();
  });

  it("shows an error, not stale results, when the server refuses (429)", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply("Smith water damage"))
      .mockResolvedValueOnce(reply("x", false, 429));
    vi.stubGlobal("fetch", f);
    render(<GlobalSearch open />);
    const input = screen.getByPlaceholderText(/Search reports/);

    typeInto(input, "smi");
    await settle();
    expect(screen.getByText("Smith water damage")).toBeInTheDocument();

    typeInto(input, "jones");
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Search failed, try again.",
    );
    expect(screen.queryByText("Smith water damage")).not.toBeInTheDocument();
  });

  it("ignores an older reply that arrives after a newer one", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    let resolveNew: (v: unknown) => void = () => {};
    const f = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockImplementationOnce(() => new Promise((r) => (resolveNew = r)));
    vi.stubGlobal("fetch", f);
    render(<GlobalSearch open />);
    const input = screen.getByPlaceholderText(/Search reports/);

    fireEvent.change(input, { target: { value: "smith" } });
    await settle();
    fireEvent.change(input, { target: { value: "jones" } });
    await settle();
    expect(searchCalls(f)).toHaveLength(2);

    await act(async () => resolveNew(reply("Jones flood")));
    await act(async () => resolveOld(reply("Smith water damage")));

    expect(screen.getByText("Jones flood")).toBeInTheDocument();
    expect(screen.queryByText("Smith water damage")).not.toBeInTheDocument();
  });
});
