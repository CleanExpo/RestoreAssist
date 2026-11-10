// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8084: a failed contents-manifest load must not read as "No manifest generated yet".

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "insp-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const fail = () =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import ContentsPage from "../page";

describe("InspectionContentsPage load failure (RA-8084)", () => {
  it("shows the error and Retry, not the empty manifest state, when the load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => fail()));
    render(<ContentsPage />);

    expect(await screen.findByText("Failed to load contents manifest")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText("No manifest generated yet")).toHaveLength(0);
    expect(screen.queryAllByText("No photos on this inspection yet")).toHaveLength(0);
  });
});
