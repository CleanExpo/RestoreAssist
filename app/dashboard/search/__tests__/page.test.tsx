// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

import SearchPage from "../page";

describe("Search page", () => {
  it("gives the search textbox an explicit accessible name", () => {
    render(<SearchPage />);

    expect(
      screen.getByRole("textbox", {
        name: "Search reports, clients, and inspections",
      }),
    ).toHaveAttribute(
      "placeholder",
      "Search reports, clients, inspections...",
    );
  });
});
