// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// RA-8084: a failed credit-note load must not read as "No credit notes issued yet".

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

import CreditNotesPage from "../page";

describe("CreditNotesPage load failure (RA-8084)", () => {
  it("shows the error and Retry, not the empty-account state, when the load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => fail()));
    render(<CreditNotesPage />);

    expect(await screen.findByText("Failed to load credit notes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryAllByText(/No credit notes issued yet/)).toHaveLength(0);
    expect(screen.queryAllByText(/issue your first credit note/)).toHaveLength(0);
  });
});
