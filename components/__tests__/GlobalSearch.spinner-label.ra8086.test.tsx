// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { GlobalSearch } from "@/components/GlobalSearch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * RA-8086 item 3. While a search is in flight the header search showed only a
 * spinning ring with no text, so a screen reader announced nothing. The
 * loading state is now a status region named "Searching".
 */
describe("GlobalSearch loading state (RA-8086)", () => {
  it("announces the in-flight search as a status named Searching", () => {
    // A request that never settles keeps the component in its loading state.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<GlobalSearch open />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "water" } });

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Searching");
  });
});
