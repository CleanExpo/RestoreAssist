// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8084: a failed restoration-document load must not read as
// "No restoration documents yet".

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const fail = () =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import RestorationDocumentsPage from "../page";

describe("RestorationDocumentsPage load failure (RA-8084)", () => {
  it("shows the error and Retry, not the empty-account state, when the load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => fail()));
    render(<RestorationDocumentsPage />);

    expect(await screen.findByText(/Failed to load restoration documents/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText("No restoration documents yet")).toHaveLength(0);
    expect(screen.queryAllByText(/Create a Tax Invoice/)).toHaveLength(0);
  });
});
