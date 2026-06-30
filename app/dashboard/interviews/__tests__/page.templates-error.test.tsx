// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// STORM 100-closeout — interviews page must surface a failed form-templates
// load (Marcus), not silently render nothing once the spinner clears.

const useFetch = vi.fn();
vi.mock("@/lib/hooks/useFetch", () => ({
  useFetch: (url: string) => useFetch(url),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import InterviewsPage from "../page";

const idle = { data: null, loading: false, error: null, refetch: vi.fn() };

beforeEach(() => {
  useFetch.mockReset();
  useFetch.mockImplementation((url: string) => {
    if (url.startsWith("/api/form-templates")) {
      return { ...idle, error: "Server error 500" };
    }
    if (url.startsWith("/api/interviews")) {
      return { ...idle, data: { sessions: [] } };
    }
    return idle; // analytics/stats
  });
});

describe("InterviewsPage — templates load error", () => {
  it("renders an alert when /api/form-templates fails", () => {
    render(<InterviewsPage />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/couldn.?t load form templates/i);
  });
});
