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

/** Emits the given frames, then the reader rejects (simulates a network drop). */
function streamThenError(frames: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read: async () => {
            if (i < frames.length) {
              return { done: false, value: encoder.encode(frames[i++]) };
            }
            throw new Error("network drop");
          },
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

  it("renders a success tool-call card when the teacher logs a reading (RA-1132i-2)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      return Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: "tool_call", id: "tc1", toolName: "take_reading", ok: true, result: { location: "Bathroom", value: 45, unit: "PERCENT_MC" } })}\n\n`,
          `data: ${JSON.stringify({ type: "token", content: "Logged 45% in the bathroom." })}\n\n`,
          `data: ${JSON.stringify({ type: "done", utteranceId: "u1", clauseRefs: [], confidence: 0.9 })}\n\n`,
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    ask("Bathroom drywall reads 45 percent");

    await waitFor(() =>
      expect(
        screen.getByText("Logged reading — Bathroom: 45 PERCENT_MC"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Live Teacher action")).toBeInTheDocument();
    expect(
      screen.getByText("Logged 45% in the bathroom."),
    ).toBeInTheDocument();
  });

  it("renders a check_report_gaps card with the gap list (RA-1132f-2)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      return Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: "tool_call", id: "g1", toolName: "check_report_gaps", ok: true, result: { gaps: [{ field: "photos", severity: "warn", description: "No photos captured for this inspection" }, { field: "iicrcClassification", severity: "block", description: "IICRC S500:2021 water category and class not yet determined" }] } })}\n\n`,
          `data: ${JSON.stringify({ type: "token", content: "You still need photos and a classification." })}\n\n`,
          `data: ${JSON.stringify({ type: "done", utteranceId: "u1", clauseRefs: [], confidence: 0.9 })}\n\n`,
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    ask("What am I still missing?");

    await waitFor(() =>
      expect(
        screen.getByText("Report check — 2 gaps to address"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("No photos captured for this inspection"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "IICRC S500:2021 water category and class not yet determined",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Blocker")).toBeInTheDocument();
    expect(screen.getByText("Check")).toBeInTheDocument();
  });

  it("renders a muted 'not completed' card when a tool call fails", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      return Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: "tool_call", id: "tc1", toolName: "take_reading", ok: false, error: "tenancy check failed" })}\n\n`,
          `data: ${JSON.stringify({ type: "token", content: "I couldn't log that." })}\n\n`,
          `data: ${JSON.stringify({ type: "done", utteranceId: "u1", clauseRefs: [], confidence: 0.5 })}\n\n`,
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    ask("log a reading");

    await waitFor(() =>
      expect(screen.getByText("Action not completed")).toBeInTheDocument(),
    );
    expect(screen.getByText("Take reading")).toBeInTheDocument();
    // The failure must NOT masquerade as a successful log.
    expect(
      screen.queryByText(/^Logged reading/),
    ).not.toBeInTheDocument();
  });

  it("keeps the tool-call card when the stream drops after an action was logged (RA-1132i-2)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      return Promise.resolve(
        streamThenError([
          `data: ${JSON.stringify({ type: "tool_call", id: "tc1", toolName: "take_reading", ok: true, result: { location: "Bathroom", value: 45, unit: "PERCENT_MC" } })}\n\n`,
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    ask("Bathroom reads 45");

    // The reading was persisted server-side; its card must survive the drop so
    // the tech doesn't re-log it.
    await waitFor(() =>
      expect(
        screen.getByText("Logged reading — Bathroom: 45 PERCENT_MC"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders a WHS confirm card and records only on confirm (RA-1132f-3)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      if (url === "/api/live-teacher/hazard/confirm") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ data: { incidentId: "whs-1" } }),
        } as unknown as Response);
      }
      return Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: "tool_proposal", id: "tc-1", toolName: "flag_whs_hazard", args: { hazardType: "asbestos", severity: "HIGH", location: "Ceiling void", controls: ["Isolate area"] } })}\n\n`,
          `data: ${JSON.stringify({ type: "token", content: "I've flagged an asbestos hazard for your confirmation." })}\n\n`,
          `data: ${JSON.stringify({ type: "done", utteranceId: "u1", clauseRefs: [], confidence: 0.6 })}\n\n`,
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    ask("There's asbestos in the ceiling");

    await waitFor(() =>
      expect(screen.getByText("Confirm WHS hazard")).toBeInTheDocument(),
    );
    expect(screen.getByText("asbestos — HIGH")).toBeInTheDocument();
    expect(screen.getByText("Location: Ceiling void")).toBeInTheDocument();
    // Nothing recorded before confirm.
    expect(
      fetchMock.mock.calls.some(
        (c) => c[0] === "/api/live-teacher/hazard/confirm",
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Confirm & record" }));

    await waitFor(() =>
      expect(screen.getByText(/Recorded: asbestos hazard/)).toBeInTheDocument(),
    );
    const confirmCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/live-teacher/hazard/confirm",
    );
    expect(
      JSON.parse((confirmCall![1] as RequestInit).body as string),
    ).toEqual({ toolCallId: "tc-1" });
    expect(screen.queryByText("Confirm WHS hazard")).not.toBeInTheDocument();
  });

  it("dismisses a WHS proposal without recording anything", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      return Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: "tool_proposal", id: "tc-1", toolName: "flag_whs_hazard", args: { hazardType: "electrical", severity: "MEDIUM" } })}\n\n`,
          `data: ${JSON.stringify({ type: "token", content: "Flagged for your review." })}\n\n`,
          `data: ${JSON.stringify({ type: "done", utteranceId: "u1", clauseRefs: [], confidence: 0.6 })}\n\n`,
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    ask("dodgy wiring");

    await waitFor(() =>
      expect(screen.getByText("Confirm WHS hazard")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() =>
      expect(screen.queryByText("Confirm WHS hazard")).not.toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.some(
        (c) => c[0] === "/api/live-teacher/hazard/confirm",
      ),
    ).toBe(false);
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
