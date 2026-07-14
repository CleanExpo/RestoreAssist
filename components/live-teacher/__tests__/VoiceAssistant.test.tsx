// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// RA-7051: VoiceAssistant reuses VoiceNoteButton, which imports the offline
// queue. Mock it (same idiom as voice-note-button.test.tsx) so the offline
// path is observable without IndexedDB.
const queueVoiceNote = vi.fn();
vi.mock("@/lib/voice-note-queue", () => ({
  queueVoiceNote: (...args: unknown[]) => queueVoiceNote(...args),
}));

import { VoiceAssistant } from "../VoiceAssistant";

// RA-7051: minimal MediaRecorder + getUserMedia stand-ins (same idiom as
// components/voice/__tests__/voice-note-button.test.tsx) so the Whisper
// push-to-talk path runs under jsdom.
class FakeMediaRecorder {
  static isTypeSupported() {
    return true;
  }
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    public stream: MediaStream,
    public options?: unknown,
  ) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["chunk"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

function mockGetUserMedia(reject = false) {
  const stream = {
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
  Object.defineProperty(window.navigator, "mediaDevices", {
    value: {
      getUserMedia: reject
        ? vi.fn().mockRejectedValue(new Error("Permission denied"))
        : vi.fn().mockResolvedValue(stream),
    },
    configurable: true,
  });
}

async function recordOnce() {
  fireEvent.click(screen.getByRole("button", { name: "Start voice note" }));
  await waitFor(() => screen.getByRole("button", { name: "Stop recording" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
}

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

  it("lets the tech override an answer with an insurer-visible reason (RA-1132i-3)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      if (url === "/api/live-teacher/utterance/override") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { overridden: true } }),
        } as unknown as Response);
      }
      return Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: "token", content: "This is Category 2 water." })}\n\n`,
          `data: ${JSON.stringify({ type: "done", utteranceId: "utt-9", clauseRefs: [], confidence: 0.8 })}\n\n`,
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    ask("What category?");

    await waitFor(() =>
      expect(screen.getByText("This is Category 2 water.")).toBeInTheDocument(),
    );
    // Override control appears once the utterance id arrives on `done`.
    fireEvent.click(screen.getByRole("button", { name: "Override" }));
    fireEvent.change(screen.getByLabelText("Override reason"), {
      target: { value: "It's Cat 3 — sewage present" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record override" }));

    await waitFor(() =>
      expect(
        screen.getByText(/Overridden by technician: It's Cat 3 — sewage present/),
      ).toBeInTheDocument(),
    );
    const overrideCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/live-teacher/utterance/override",
    );
    expect(
      JSON.parse((overrideCall![1] as RequestInit).body as string),
    ).toEqual({ utteranceId: "utt-9", reason: "It's Cat 3 — sewage present" });
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

describe("VoiceAssistant — voice-lite push-to-talk (RA-7051)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    queueVoiceNote.mockReset();
    mockGetUserMedia();
    (global as unknown as { MediaRecorder: unknown }).MediaRecorder =
      FakeMediaRecorder;
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads replies aloud by default when speech synthesis is available", () => {
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak: vi.fn() });
    render(<VoiceAssistant inspectionId="insp1" />);
    const control = screen.getByRole("checkbox", { name: /read replies aloud/i });
    expect(control).toBeChecked();
  });

  it("drops the Whisper transcript into the input and does not auto-send", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/ai/voice-note-transcribe") {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ transcript: "Is this Category 3 water?" }),
        } as unknown as Response);
      }
      if (url === "/api/live-teacher/session") return Promise.resolve(sessionOk);
      return Promise.resolve(
        streamResponse([
          `data: ${JSON.stringify({ type: "token", content: "Yes." })}\n\n`,
          `data: ${JSON.stringify({ type: "done", utteranceId: "u1", clauseRefs: [], confidence: 0.9 })}\n\n`,
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    await recordOnce();

    const textarea = await screen.findByLabelText<HTMLTextAreaElement>(
      "Ask the Live Teacher",
    );
    await waitFor(() =>
      expect(textarea.value).toBe("Is this Category 3 water?"),
    );
    // The transcript must NOT auto-post a turn — the tech reviews then taps Ask.
    expect(
      fetchMock.mock.calls.some((c) => c[0] === "/api/live-teacher/turn"),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c) => c[0] === "/api/live-teacher/turn"),
      ).toBe(true),
    );
  });

  it("ignores an empty transcript (no turn, no throw)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/ai/voice-note-transcribe") {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ transcript: "   " }),
        } as unknown as Response);
      }
      return Promise.resolve(sessionOk);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    await recordOnce();

    const textarea = screen.getByLabelText<HTMLTextAreaElement>(
      "Ask the Live Teacher",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start voice note" })).toBeEnabled(),
    );
    expect(textarea.value).toBe("");
    expect(
      fetchMock.mock.calls.some((c) => c[0] === "/api/live-teacher/turn"),
    ).toBe(false);
  });

  it("falls back to the Web Speech mic when transcribe returns 402", async () => {
    // Web Speech must be supported for the fallback tier to render.
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: unknown = null;
      onend: unknown = null;
      onerror: unknown = null;
      start = vi.fn();
      stop = vi.fn();
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      FakeRecognition;

    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/ai/voice-note-transcribe") {
        return Promise.resolve({
          status: 402,
          ok: false,
          json: async () => ({ error: { code: "PAYMENT_REQUIRED" } }),
        } as unknown as Response);
      }
      return Promise.resolve(sessionOk);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    await recordOnce();

    // The Web Speech "Speak" button appears; the panel does not dead-end.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Start voice input" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Start voice note" }),
    ).not.toBeInTheDocument();

    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it("queues offline instead of posting a turn", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });
    queueVoiceNote.mockResolvedValue("vn-1");
    const fetchMock = vi.fn(() => Promise.resolve(sessionOk));
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    await recordOnce();

    await waitFor(() => expect(queueVoiceNote).toHaveBeenCalledTimes(1));
    const textarea = screen.getByLabelText<HTMLTextAreaElement>(
      "Ask the Live Teacher",
    );
    expect(textarea.value).toBe("");
    expect(
      fetchMock.mock.calls.some((c) => c[0] === "/api/live-teacher/turn"),
    ).toBe(false);
  });

  it("stays idle when microphone permission is denied", async () => {
    mockGetUserMedia(true);
    const fetchMock = vi.fn(() => Promise.resolve(sessionOk));
    vi.stubGlobal("fetch", fetchMock);

    render(<VoiceAssistant inspectionId="insp1" />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice note" }));

    // No crash; the Whisper button remains ready and no turn is posted.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Start voice note" }),
      ).toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.some((c) => c[0] === "/api/live-teacher/turn"),
    ).toBe(false);
  });
});
