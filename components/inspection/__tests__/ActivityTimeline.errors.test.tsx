// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ActivityTimeline from "../ActivityTimeline";

const EMPTY = "No activity recorded yet";

beforeEach(() => vi.restoreAllMocks());

describe("ActivityTimeline failures (RA-8085)", () => {
  it.each([
    [
      "a non-ok response",
      () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
    ],
    ["a thrown fetch", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("shows an error, not the empty text, on %s", async (_, fail) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(fail));
    render(<ActivityTimeline inspectionId="i1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load the activity log.",
    );
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
  });

  it("still shows the empty text for a genuinely empty log", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ activity: [] }) }),
    );
    render(<ActivityTimeline inspectionId="i1" />);
    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
