// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/margot/access answers 403 to anyone who is not platform staff.
// The dashboard must read that refusal (and an unreadable probe) as locked —
// notice shown, chat controls disabled — not as "no answer, leave it open".
// The allowlisted operator is the positive control.

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
    status: "ready",
    error: undefined,
  }),
}));
vi.mock("@/components/margot/SocialRelevanceTester", () => ({
  SocialRelevanceTester: () => null,
}));

import MargotDashboardPage from "../page";

const LOCKED = "Margot chat is locked for this account.";
const fetchMock = vi.fn();

function probeAnswers(response: Promise<Response>) {
  fetchMock.mockImplementation((url: string) =>
    url === "/api/margot/access"
      ? response
      : Promise.reject(new Error(`unexpected fetch ${url}`)),
  );
}

function textarea() {
  return screen.getByPlaceholderText(/Message Margot/);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no ResizeObserver; the conversation scroll container needs one.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Margot dashboard access probe", () => {
  it("locks chat when the probe refuses with 403", async () => {
    probeAnswers(
      Promise.resolve(
        new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
      ),
    );
    render(<MargotDashboardPage />);
    expect(await screen.findByText(LOCKED)).toBeInTheDocument();
    expect(textarea()).toBeDisabled();
  });

  it("locks chat when the probe cannot be reached", async () => {
    probeAnswers(Promise.reject(new TypeError("network down")));
    render(<MargotDashboardPage />);
    expect(await screen.findByText(LOCKED)).toBeInTheDocument();
    expect(textarea()).toBeDisabled();
  });

  it("leaves chat open for the allowlisted operator", async () => {
    probeAnswers(
      Promise.resolve(
        new Response(
          JSON.stringify({ allowed: true, userId: "staff", role: "ADMIN" }),
          { status: 200 },
        ),
      ),
    );
    render(<MargotDashboardPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(LOCKED)).not.toBeInTheDocument();
    expect(textarea()).not.toBeDisabled();
  });
});
