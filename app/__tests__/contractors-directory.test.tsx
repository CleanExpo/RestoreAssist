// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span>{props.alt}</span>,
}));

import ContractorDirectoryPage from "../contractors/page";

function contractor(businessName: string) {
  return {
    id: businessName,
    slug: businessName.toLowerCase().replace(/\s+/g, "-"),
    businessName,
    businessLogo: null,
    businessAddress: null,
    publicDescription: null,
    yearsInBusiness: null,
    teamSize: null,
    isVerified: false,
    averageRating: 0,
    totalReviews: 0,
    completedJobs: 0,
    specializations: [],
    certifications: [],
    serviceAreas: [],
  };
}

function reply(names: string[], ok = true, status = 200, pages = 1) {
  return {
    ok,
    status,
    json: async () =>
      ok
        ? {
            contractors: names.map(contractor),
            pagination: { page: 1, limit: 12, total: names.length, pages },
          }
        : { error: "Too many requests" },
  };
}

async function settle(ms = 300) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function directoryCalls(f: ReturnType<typeof vi.fn>) {
  return f.mock.calls
    .map(([u]) => String(u))
    .filter((u) => u.startsWith("/api/contractors"));
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

describe("contractor directory search (RA-8448)", () => {
  it("sends one request for an 8-character search, on page 1", async () => {
    const f = vi.fn().mockResolvedValue(reply(["Acme Drying"], true, 200, 5));
    vi.stubGlobal("fetch", f);
    render(<ContractorDirectoryPage />);
    await settle();
    expect(directoryCalls(f)).toHaveLength(1);

    // Move to page 2 first, so a page that is not reset shows in the request.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    expect(directoryCalls(f).at(-1)).toContain("page=2");
    f.mockClear();

    const input = screen.getByPlaceholderText(/Search by business name/);
    const text = "flooding";
    for (let i = 1; i <= text.length; i++) {
      fireEvent.change(input, { target: { value: text.slice(0, i) } });
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }
    await settle();

    const calls = directoryCalls(f);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("search=flooding");
    expect(calls[0]).toContain("page=1");
  });

  it.each([429, 500])(
    "shows an error, not an empty list, on HTTP %i",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(reply([], false, status)),
      );
      render(<ContractorDirectoryPage />);
      await settle();

      expect(screen.getByRole("alert")).toHaveTextContent(
        /Could not load contractors/,
      );
      expect(
        screen.queryByText("No contractors found"),
      ).not.toBeInTheDocument();
    },
  );

  it("ignores an older reply that arrives after a newer one", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    let resolveNew: (v: unknown) => void = () => {};
    const f = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockImplementationOnce(() => new Promise((r) => (resolveNew = r)));
    vi.stubGlobal("fetch", f);
    render(<ContractorDirectoryPage />);
    await settle();

    const input = screen.getByPlaceholderText(/Search by business name/);
    fireEvent.change(input, { target: { value: "jones" } });
    await settle();
    expect(directoryCalls(f)).toHaveLength(2);

    await act(async () => resolveNew(reply(["Jones Restoration"])));
    await act(async () => resolveOld(reply(["Old Result Pty Ltd"])));

    expect(screen.getByText("Jones Restoration")).toBeInTheDocument();
    expect(screen.queryByText("Old Result Pty Ltd")).not.toBeInTheDocument();
  });
});
