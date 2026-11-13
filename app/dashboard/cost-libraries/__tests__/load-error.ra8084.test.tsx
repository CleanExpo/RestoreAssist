// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8084: a failed cost-library load must not read as "No libraries yet".

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const fail = () =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import CostLibrariesPage from "../page";

describe("CostLibrariesPage load failure (RA-8084)", () => {
  it("shows the error and Retry, not 'No libraries yet', when the load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => fail()));
    render(<CostLibrariesPage />);

    expect(await screen.findByText(/Failed to load cost libraries/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText("No libraries yet")).toHaveLength(0);
  });
});
