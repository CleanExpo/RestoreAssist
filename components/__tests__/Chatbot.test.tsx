// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// RA-6941 — Chatbot must render the `.error.message` from the API's error
// envelope (`{ error: { code, message } }`, as emitted by lib/api-errors.ts
// apiError()), never the coerced-to-string envelope object itself
// ("[object Object]").

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u_1", name: "Jamie" } },
    status: "authenticated",
  }),
}));

vi.mock("next/image", () => {
  const React = require("react");
  return {
    default: ({ src, alt, ...rest }: Record<string, unknown>) =>
      React.createElement("img", { src, alt, ...rest }),
  };
});

vi.mock("react-markdown", () => {
  const React = require("react");
  return {
    default: ({ children }: { children: string }) =>
      React.createElement("div", null, children),
  };
});

// react-hot-toast is used both as a callable (`toast(...)`) and via
// `toast.success` / `toast.error`, so the mock must be a callable with methods.
vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});

import toast from "react-hot-toast";
import Chatbot from "../Chatbot";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

// jsdom doesn't implement scrollIntoView; Chatbot calls it on every
// messages-state update to keep the transcript pinned to the bottom.
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // Default: GET /api/chatbot history load returns no history.
  fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return Promise.resolve({ ok: true, json: async () => ({ response: "hi" }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ messages: [] }) });
  });
});

async function openChatAndSend(text: string) {
  render(<Chatbot />);
  const openButton = await screen.findByLabelText(/Open Margot/i);
  fireEvent.click(openButton);
  const input = await screen.findByPlaceholderText(/Type or speak/i);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /Send message/i }));
}

describe("Chatbot — error envelope parsing (RA-6941)", () => {
  it("renders the nested error.message from a 402 KEY_INVALID envelope, not [object Object]", async () => {
    const invalidKeyMessage =
      "Your Anthropic API key is invalid or expired. Re-add it in Workspace Settings -> AI Providers.";
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 402,
          json: async () => ({
            error: { code: "PAYMENT_REQUIRED", message: invalidKeyMessage },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ messages: [] }) });
    });

    await openChatAndSend("Hello");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(invalidKeyMessage);
    });
    expect(toast.error).not.toHaveBeenCalledWith("[object Object]");
    expect(
      screen.queryByText("[object Object]"),
    ).not.toBeInTheDocument();
  });

  it("falls back to a generic message (not [object Object]) for a 500 with no error envelope", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({}),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ messages: [] }) });
    });

    await openChatAndSend("Hello");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to get response");
    });
    expect(toast.error).not.toHaveBeenCalledWith("[object Object]");
  });
});
