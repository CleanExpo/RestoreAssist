// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8084: a failed profile load must not read as "No certifications added yet"
// or "No service areas added yet".

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

import ContractorProfilePage from "../page";

describe("ContractorProfilePage load failure (RA-8084)", () => {
  it("shows the error and Retry, not the empty certification and area lists, when the load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => fail()));
    render(<ContractorProfilePage />);

    expect(
      await screen.findByText(/Failed to load contractor profile/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText("No certifications added yet")).toHaveLength(0);
    expect(screen.queryAllByText("No service areas added yet")).toHaveLength(0);
  });
});
