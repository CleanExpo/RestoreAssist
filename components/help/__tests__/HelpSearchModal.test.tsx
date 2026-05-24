// @vitest-environment jsdom
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import HelpSearchModal from "../HelpSearchModal";

const INDEX = [
  {
    slug: "first-inspection",
    category: "getting-started",
    title: "Your first inspection",
    audience: ["tradie"],
    aiSummary: "Walkthrough.",
    userIntents: ["how do I start an inspection"],
    readTimeMin: 5,
  },
  {
    slug: "photo-cocoa",
    category: "inspections",
    title: "Photo chain-of-custody",
    audience: ["tradie"],
    aiSummary: "How photo cocoa works.",
    userIntents: ["how to take a photo"],
    readTimeMin: 3,
  },
];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => INDEX,
  }) as any;
});

describe("HelpSearchModal", () => {
  it("does not render initially", () => {
    render(<HelpSearchModal />);
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it("opens on Cmd-K (Meta+K)", () => {
    render(<HelpSearchModal />);
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it("returns fuzzy results matching 'photo'", async () => {
    render(<HelpSearchModal />);
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "photo" } });
    await waitFor(() => {
      expect(screen.getByText(/photo chain-of-custody/i)).toBeInTheDocument();
    });
  });
});
