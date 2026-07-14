// @vitest-environment jsdom
/**
 * RA-1609 — the mic button must queue the recording (not hard-fail) when
 * offline, or when the transcribe call fails with a network error / 503.
 *
 * @/lib/voice-note-queue is mocked here (same idiom as
 * components/__tests__/nir-offline-provider.test.tsx mocking
 * @/lib/evidence-upload-queue) — this file tests the button's control flow,
 * the real IndexedDB-backed queue logic is covered by
 * lib/__tests__/voice-note-queue.test.ts.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueVoiceNote = vi.fn();
vi.mock("@/lib/voice-note-queue", () => ({
  queueVoiceNote: (...args: unknown[]) => queueVoiceNote(...args),
}));

import { VoiceNoteButton } from "@/components/voice/voice-note-button";

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

function mockGetUserMedia() {
  const stream = {
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
  Object.defineProperty(window.navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    configurable: true,
  });
}

async function startThenStopRecording() {
  fireEvent.click(screen.getByRole("button", { name: "Start voice note" }));
  await waitFor(() => screen.getByRole("button", { name: "Stop recording" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
}

beforeEach(() => {
  queueVoiceNote.mockReset();
  mockGetUserMedia();
  (global as unknown as { MediaRecorder: unknown }).MediaRecorder =
    FakeMediaRecorder;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("VoiceNoteButton — offline queueing (RA-1609)", () => {
  it("queues the recording with context instead of hard-failing when offline", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });
    queueVoiceNote.mockResolvedValue("vn-1");
    const onTranscript = vi.fn();

    render(
      <VoiceNoteButton
        onTranscript={onTranscript}
        inspectionId="insp-42"
        fieldLabel="kitchen-notes"
      />,
    );

    await startThenStopRecording();

    await waitFor(() => expect(queueVoiceNote).toHaveBeenCalledTimes(1));
    expect(queueVoiceNote).toHaveBeenCalledWith(expect.any(Blob), {
      inspectionId: "insp-42",
      fieldLabel: "kitchen-notes",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Queued — will transcribe when back online/),
    ).toBeInTheDocument();
    // The old hard-fail copy must be gone.
    expect(
      screen.queryByText(/unavailable offline/i),
    ).not.toBeInTheDocument();
  });

  it("queues on a 503 from the transcribe route", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 503,
      ok: false,
      json: async () => ({ error: "Upstream unavailable" }),
    });
    queueVoiceNote.mockResolvedValue("vn-2");

    render(
      <VoiceNoteButton
        onTranscript={vi.fn()}
        inspectionId="insp-42"
        fieldLabel="kitchen-notes"
      />,
    );

    await startThenStopRecording();

    await waitFor(() => expect(queueVoiceNote).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/Queued — will transcribe when back online/),
    ).toBeInTheDocument();
  });

  it("queues on a network error even when navigator.onLine reports true", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    queueVoiceNote.mockResolvedValue("vn-3");

    render(
      <VoiceNoteButton
        onTranscript={vi.fn()}
        inspectionId="insp-42"
        fieldLabel="kitchen-notes"
      />,
    );

    await startThenStopRecording();

    await waitFor(() => expect(queueVoiceNote).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/Queued — will transcribe when back online/),
    ).toBeInTheDocument();
  });

  it("fires onUnavailable on a no-key (PAYMENT_REQUIRED) 402", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 402,
      ok: false,
      json: async () => ({ error: { code: "PAYMENT_REQUIRED" } }),
    });
    const onUnavailable = vi.fn();
    const onTranscript = vi.fn();

    render(
      <VoiceNoteButton
        onTranscript={onTranscript}
        onUnavailable={onUnavailable}
        inspectionId="insp-42"
        fieldLabel="kitchen-notes"
      />,
    );

    await startThenStopRecording();

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(onTranscript).not.toHaveBeenCalled();
    expect(queueVoiceNote).not.toHaveBeenCalled();
  });

  it("does NOT fire onUnavailable on a subscription 402 — surfaces the error instead", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 402,
      ok: false,
      json: async () => ({
        error: "Active subscription required",
        upgradeRequired: true,
      }),
    });
    const onUnavailable = vi.fn();

    render(
      <VoiceNoteButton
        onTranscript={vi.fn()}
        onUnavailable={onUnavailable}
        inspectionId="insp-42"
        fieldLabel="kitchen-notes"
      />,
    );

    await startThenStopRecording();

    // A subscription gate must NOT downgrade the mic — it surfaces as an error.
    expect(
      await screen.findByText("Active subscription required"),
    ).toBeInTheDocument();
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("still transcribes normally when online and the route succeeds (regression guard)", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ transcript: "Category 2 water damage" }),
    });
    const onTranscript = vi.fn();

    render(
      <VoiceNoteButton
        onTranscript={onTranscript}
        inspectionId="insp-42"
        fieldLabel="kitchen-notes"
      />,
    );

    await startThenStopRecording();

    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith("Category 2 water damage"),
    );
    expect(queueVoiceNote).not.toHaveBeenCalled();
  });
});
