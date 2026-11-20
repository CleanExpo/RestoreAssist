// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8084: a failed review load must not read as "No reviews yet".

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { role: "USER" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const fail = () =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({}) });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import ReviewsPage from "../page";

describe("ContractorReviewsPage load failure (RA-8084)", () => {
  it("shows the error and Retry, not 'No reviews yet', when the load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => fail()));
    render(<ReviewsPage />);

    expect(
      await screen.findByText(/Failed to load contractor profile for reviews/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText("No reviews yet")).toHaveLength(0);
  });
});
