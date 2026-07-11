// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceAssistant } from "../VoiceAssistant";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function streamResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read: async () =>
            i < frames.length
              ? { done: false, value: encoder.encode(frames[i++]) }
              : { done: true, value: undefined },
        };
      },
    },
  } as unknown as Response;
}

const sessionOk = {
  ok: true,
  status: 201,
  json: async () => ({ data: { sessionId: "s1" } }),
} as unknown as Response;

function ask(text: string) {
  fireEvent.change(screen.getByLabelText("Ask the Live Teacher"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  // jsdom lacks scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

describe("VoiceAssistant", () => {
  it("disables Ask until there is input", () => {
    render(<VoiceAssistant inspectionId="insp1" />);
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Ask the Live Teacher"), {
      target: { value: "What category is this?" },
    });
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
  });

  it("opens a session, streams a grounded answer, and shows citations + confidence", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      return Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: "token", content: "This is Category 2 water." })}\n\n`,
          `data: ${JSON.stringify({ type: "done", utteranceId: "u1", clauseRefs: ["S500:2021 §10.5"], confidence: 0.83 })}\n\n`,
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" jurisdiction="AU" />);
    ask("What category is this?");

    await waitFor(() =>
      expect(screen.getByText("This is Category 2 water.")).toBeInTheDocument(),
    );
    expect(screen.getByText("S500:2021 §10.5")).toBeInTheDocument();
    expect(screen.getByText("Confidence 83%")).toBeInTheDocument();

    // session created, then a turn with the right body
    const sessionCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/live-teacher/session",
    );
    expect(sessionCall).toBeTruthy();
    const turnCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/live-teacher/turn",
    );
    const body = JSON.parse((turnCall![1] as RequestInit).body as string);
    expect(body).toEqual({ sessionId: "s1", utterance: "What category is this?" });
  });

  it("shows the subscription CTA on 402 upgradeRequired", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      return Promise.resolve({
        ok: false,
        status: 402,
        json: async () => ({ error: "x", upgradeRequired: true }),
      } as unknown as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    ask("hello");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "View plans" })).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Add Anthropic key" }),
    ).not.toBeInTheDocument();
  });

  it("shows the BYOK CTA on 402 without upgradeRequired", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      return Promise.resolve({
        ok: false,
        status: 402,
        json: async () => ({ error: { code: "PAYMENT_REQUIRED" } }),
      } as unknown as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    ask("hello");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add Anthropic key" }),
      ).toBeInTheDocument(),
    );
  });

  it("renders a fallback when the stream errors mid-answer", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      return Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: "error", message: "Stream error" })}\n\n`,
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    ask("hello");

    await waitFor(() =>
      expect(
        screen.getByText(/something went wrong mid-answer/i),
      ).toBeInTheDocument(),
    );
  });
});
