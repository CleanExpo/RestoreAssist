// @vitest-environment jsdom
/**
 * RA-7623 — a voice note on the room selection panel becomes Accept/Reject
 * suggestions. The job is unchanged until Accept. Accept writes the mapped
 * enums through the existing room save callbacks, and an ACM material raises
 * the WHS gate without a later non-ACM accept clearing it.
 */
import "@testing-library/jest-dom/vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANZ_MATERIAL_OPTIONS } from "@/lib/anz/material-options";
import {
  SKETCH_ROOM_VOICE_FIELD,
  SketchSelectionPanel,
  type SelectedObject,
} from "../SketchSelectionPanel";

const queueVoiceNote = vi.fn();
const getPendingTranscripts = vi.fn();
const markTranscriptConsumed = vi.fn();

vi.mock("@/lib/voice-note-queue", () => ({
  queueVoiceNote: (...args: unknown[]) => queueVoiceNote(...args),
  getPendingTranscripts: (...args: unknown[]) => getPendingTranscripts(...args),
  markTranscriptConsumed: (...args: unknown[]) => markTranscriptConsumed(...args),
  VOICE_NOTES_DRAINED_EVENT: "ra-voice-notes-drained",
}));

const FIXTURE = "Living room 4 x 3.2 metres, vinyl tiles, category 2";

interface JobRecord {
  materialSlug?: string;
  waterCategory?: "cat1" | "cat2" | "cat3";
  lengthM?: number;
  widthM?: number;
  voiceRaisedAcm: boolean;
}

function JobHarness({
  initial = { voiceRaisedAcm: false },
}: {
  initial?: JobRecord;
}) {
  const [job, setJob] = useState<JobRecord>(initial);
  const selected: SelectedObject = {
    id: "room-1",
    type: "room",
    label: "Living room",
    materialSlug: job.materialSlug,
    waterCategory: job.waterCategory,
    lengthM: job.lengthM,
    widthM: job.widthM,
    voiceRaisedAcm: job.voiceRaisedAcm,
  };
  return (
    <>
      <pre data-testid="job">{JSON.stringify(job)}</pre>
      <SketchSelectionPanel
        selected={selected}
        materials={ANZ_MATERIAL_OPTIONS}
        propertyYearBuilt={1988}
        inspectionId="job-1"
        onMaterialChange={(_id, slug) =>
          setJob((prev) => ({ ...prev, materialSlug: slug }))
        }
        onWaterCategoryChange={(_id, category) =>
          setJob((prev) => ({ ...prev, waterCategory: category }))
        }
        onDimensionsChange={(_id, dims) =>
          setJob((prev) => ({
            ...prev,
            lengthM: dims.lengthM ?? prev.lengthM,
            widthM: dims.widthM ?? prev.widthM,
          }))
        }
        onVoiceAcmRaised={() =>
          setJob((prev) => ({ ...prev, voiceRaisedAcm: true }))
        }
      />
    </>
  );
}

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
    this.ondataavailable?.({
      data: new Blob(["chunk"], { type: "audio/webm" }),
    });
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

function jobRecord(): JobRecord {
  return JSON.parse(screen.getByTestId("job").textContent || "{}") as JobRecord;
}

async function recordTranscript() {
  fireEvent.click(screen.getByRole("button", { name: "Start voice note" }));
  await waitFor(() => screen.getByRole("button", { name: "Stop recording" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
}

beforeEach(() => {
  queueVoiceNote.mockReset();
  getPendingTranscripts.mockReset();
  markTranscriptConsumed.mockReset();
  getPendingTranscripts.mockResolvedValue([]);
  markTranscriptConsumed.mockResolvedValue(undefined);
  queueVoiceNote.mockResolvedValue("vn-1");
  mockGetUserMedia();
  Object.defineProperty(window.navigator, "onLine", {
    value: true,
    configurable: true,
  });
  (global as unknown as { MediaRecorder: unknown }).MediaRecorder =
    FakeMediaRecorder;
  vi.stubGlobal("fetch", vi.fn());
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
});

describe("SketchSelectionPanel — voice note suggestions (RA-7623)", () => {
  it("shows suggestions and leaves the job unchanged until Accept writes vinyl-tiles, cat2 and 4 x 3.2 m", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ transcript: FIXTURE }),
    });

    render(<JobHarness />);

    await recordTranscript();

    const roomSize = await screen.findByRole("article", {
      name: "Suggested room size",
    });
    expect(roomSize).toHaveTextContent("4 × 3.2 m");
    expect(
      screen.getByRole("article", { name: "Suggested material" }),
    ).toHaveTextContent("Vinyl / lino tiles");
    expect(
      screen.getByRole("article", { name: "Suggested water category" }),
    ).toHaveTextContent("cat2");

    const before = jobRecord();
    expect(before.materialSlug).toBeUndefined();
    expect(before.waterCategory).toBeUndefined();
    expect(before.lengthM).toBeUndefined();
    expect(before.widthM).toBeUndefined();
    expect(before.voiceRaisedAcm).toBe(false);
    expect(screen.queryByText(/suspected asbestos/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept material" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Accept water category" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept room size" }));

    await waitFor(() => {
      const after = jobRecord();
      expect(after.materialSlug).toBe("vinyl-tiles");
      expect(after.waterCategory).toBe("cat2");
      expect(after.lengthM).toBe(4);
      expect(after.widthM).toBe(3.2);
    });
  });

  it("raises the WHS gate for an ACM material and does not clear it when a later material is not ACM", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ transcript: FIXTURE }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ transcript: "gyprock walls" }),
      });

    render(<JobHarness />);

    await recordTranscript();
    fireEvent.click(await screen.findByRole("button", { name: "Accept material" }));

    await waitFor(() => {
      expect(jobRecord().materialSlug).toBe("vinyl-tiles");
      expect(jobRecord().voiceRaisedAcm).toBe(true);
    });
    expect(screen.getByText(/suspected asbestos/i)).toBeInTheDocument();
    expect(screen.getByText(/strip-?out|blocked/i)).toBeInTheDocument();

    await recordTranscript();
    const materialAccepts = await screen.findAllByRole("button", {
      name: "Accept material",
    });
    fireEvent.click(materialAccepts[materialAccepts.length - 1]);

    await waitFor(() => {
      expect(jobRecord().materialSlug).toBe("gyprock");
    });
    expect(jobRecord().voiceRaisedAcm).toBe(true);
    expect(screen.getByText(/suspected asbestos/i)).toBeInTheDocument();
  });

  it("shows an unrecognised word and does not guess a material", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ transcript: "walls are wonderboard" }),
    });

    render(<JobHarness />);
    await recordTranscript();

    expect(
      await screen.findByText(/didn't recognise: wonderboard/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept material" }),
    ).not.toBeInTheDocument();
    expect(jobRecord().materialSlug).toBeUndefined();
  });

  it("turns a drained offline transcript into the same suggestions", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });

    render(<JobHarness />);
    await recordTranscript();

    expect(
      await screen.findByText(/Queued — will transcribe when back online/),
    ).toBeInTheDocument();
    expect(jobRecord().materialSlug).toBeUndefined();
    expect(
      screen.queryByRole("article", { name: "Suggested room size" }),
    ).not.toBeInTheDocument();

    getPendingTranscripts.mockResolvedValue([
      {
        id: "vn-queued",
        inspectionId: "job-1",
        fieldLabel: SKETCH_ROOM_VOICE_FIELD,
        status: "done",
        transcript: FIXTURE,
        queuedAt: new Date().toISOString(),
      },
    ]);
    await act(async () => {
      window.dispatchEvent(new Event("ra-voice-notes-drained"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      await screen.findByRole("article", { name: "Suggested room size" }),
    ).toHaveTextContent("4 × 3.2 m");
    expect(jobRecord().materialSlug).toBeUndefined();
    expect(jobRecord().waterCategory).toBeUndefined();
    expect(markTranscriptConsumed).toHaveBeenCalledWith("vn-queued");
  });
});

interface RoomFields {
  materialSlug?: string;
  waterCategory?: "cat1" | "cat2" | "cat3";
  lengthM?: number;
  widthM?: number;
  voiceRaisedAcm: boolean;
}

function TwoRoomHarness() {
  const [selectedId, setSelectedId] = useState<"room-a" | "room-b">("room-a");
  const [rooms, setRooms] = useState<Record<"room-a" | "room-b", RoomFields>>({
    "room-a": { voiceRaisedAcm: false },
    "room-b": { voiceRaisedAcm: false },
  });
  const job = rooms[selectedId];
  return (
    <>
      <button type="button" onClick={() => setSelectedId("room-a")}>
        Select room A
      </button>
      <button type="button" onClick={() => setSelectedId("room-b")}>
        Select room B
      </button>
      <pre data-testid="rooms">{JSON.stringify(rooms)}</pre>
      <SketchSelectionPanel
        selected={{
          id: selectedId,
          type: "room",
          label: selectedId,
          materialSlug: job.materialSlug,
          waterCategory: job.waterCategory,
          lengthM: job.lengthM,
          widthM: job.widthM,
          voiceRaisedAcm: job.voiceRaisedAcm,
        }}
        materials={ANZ_MATERIAL_OPTIONS}
        propertyYearBuilt={1988}
        inspectionId="job-1"
        onMaterialChange={(id, slug) =>
          setRooms((prev) => ({
            ...prev,
            [id]: { ...prev[id as "room-a" | "room-b"], materialSlug: slug },
          }))
        }
        onWaterCategoryChange={(id, category) =>
          setRooms((prev) => ({
            ...prev,
            [id]: {
              ...prev[id as "room-a" | "room-b"],
              waterCategory: category,
            },
          }))
        }
        onDimensionsChange={(id, dims) =>
          setRooms((prev) => {
            const key = id as "room-a" | "room-b";
            return {
              ...prev,
              [key]: {
                ...prev[key],
                lengthM: dims.lengthM ?? prev[key].lengthM,
                widthM: dims.widthM ?? prev[key].widthM,
              },
            };
          })
        }
        onVoiceAcmRaised={(id) =>
          setRooms((prev) => ({
            ...prev,
            [id]: { ...prev[id as "room-a" | "room-b"], voiceRaisedAcm: true },
          }))
        }
      />
    </>
  );
}

function roomsRecord(): Record<"room-a" | "room-b", RoomFields> {
  return JSON.parse(screen.getByTestId("rooms").textContent || "{}") as Record<
    "room-a" | "room-b",
    RoomFields
  >;
}

describe("SketchSelectionPanel — voice note stays on the room it was recorded in", () => {
  it("keeps an in-flight transcript on room A when the technician switches to room B", async () => {
    let resolveFetch: (value: {
      status: number;
      ok: boolean;
      json: () => Promise<{ transcript: string }>;
    }) => void = () => {};
    const pending = new Promise<{
      status: number;
      ok: boolean;
      json: () => Promise<{ transcript: string }>;
    }>((resolve) => {
      resolveFetch = resolve;
    });
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(pending);

    render(<TwoRoomHarness />);
    await recordTranscript();
    fireEvent.click(screen.getByRole("button", { name: "Select room B" }));

    resolveFetch({
      status: 200,
      ok: true,
      json: async () => ({ transcript: FIXTURE }),
    });
    await act(async () => {
      await pending;
    });

    expect(
      screen.queryByRole("article", { name: "Suggested material" }),
    ).not.toBeInTheDocument();
    expect(roomsRecord()["room-b"].materialSlug).toBeUndefined();
    expect(roomsRecord()["room-a"].materialSlug).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Select room A" }));
    expect(
      await screen.findByRole("article", { name: "Suggested material" }),
    ).toHaveTextContent("Vinyl / lino tiles");
    fireEvent.click(screen.getByRole("button", { name: "Accept material" }));
    await waitFor(() => {
      expect(roomsRecord()["room-a"].materialSlug).toBe("vinyl-tiles");
    });
    expect(roomsRecord()["room-b"].materialSlug).toBeUndefined();
    expect(roomsRecord()["room-b"].voiceRaisedAcm).toBe(false);
  });

  it("lands offline notes on the room they were recorded in and leaves the other room queued", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });
    render(<TwoRoomHarness />);

    await recordTranscript();
    expect(queueVoiceNote).toHaveBeenCalledWith(expect.any(Blob), {
      inspectionId: "job-1",
      fieldLabel: SKETCH_ROOM_VOICE_FIELD,
      roomId: "room-a",
    });

    fireEvent.click(screen.getByRole("button", { name: "Select room B" }));
    await recordTranscript();
    expect(queueVoiceNote).toHaveBeenLastCalledWith(expect.any(Blob), {
      inspectionId: "job-1",
      fieldLabel: SKETCH_ROOM_VOICE_FIELD,
      roomId: "room-b",
    });

    getPendingTranscripts.mockResolvedValue([
      {
        id: "vn-a",
        inspectionId: "job-1",
        fieldLabel: SKETCH_ROOM_VOICE_FIELD,
        roomId: "room-a",
        status: "done",
        transcript: "vinyl tiles",
        queuedAt: new Date().toISOString(),
      },
      {
        id: "vn-b",
        inspectionId: "job-1",
        fieldLabel: SKETCH_ROOM_VOICE_FIELD,
        roomId: "room-b",
        status: "done",
        transcript: "gyprock walls",
        queuedAt: new Date().toISOString(),
      },
    ]);
    await act(async () => {
      window.dispatchEvent(new Event("ra-voice-notes-drained"));
      await Promise.resolve();
      await Promise.resolve();
    });

    const roomBCard = await screen.findByRole("article", {
      name: "Suggested material",
    });
    expect(roomBCard).toHaveTextContent("Gyprock");
    expect(roomBCard).not.toHaveTextContent("Vinyl / lino tiles");
    expect(
      screen.getAllByRole("article", { name: "Suggested material" }),
    ).toHaveLength(1);
    expect(markTranscriptConsumed).toHaveBeenCalledWith("vn-b");
    expect(markTranscriptConsumed).not.toHaveBeenCalledWith("vn-a");
    expect(roomsRecord()["room-a"].materialSlug).toBeUndefined();
    expect(roomsRecord()["room-b"].materialSlug).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Select room A" }));
    const roomACard = await screen.findByRole("article", {
      name: "Suggested material",
    });
    expect(roomACard).toHaveTextContent("Vinyl / lino tiles");
    expect(roomACard).not.toHaveTextContent("Gyprock");
    expect(
      screen.getAllByRole("article", { name: "Suggested material" }),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(markTranscriptConsumed).toHaveBeenCalledWith("vn-a");
    });
  });
});

const NO_KEY_MESSAGE =
  "Voice transcription requires your own OpenAI API key — add one in Workspace Settings -> AI Providers.";

interface FakeSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

/** Pattern from the Live Teacher Web Speech fake. Deleted after each test. */
function installSpeechRecognition(): FakeSpeechRecognition[] {
  const instances: FakeSpeechRecognition[] = [];
  class FakeRecognition implements FakeSpeechRecognition {
    lang = "";
    interimResults = false;
    continuous = false;
    onresult: FakeSpeechRecognition["onresult"] = null;
    onend: FakeSpeechRecognition["onend"] = null;
    onerror: FakeSpeechRecognition["onerror"] = null;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
    constructor() {
      instances.push(this);
    }
  }
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
    FakeRecognition;
  return instances;
}

function mockNoWorkspaceKey() {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    status: 402,
    ok: false,
    json: async () => ({
      error: { code: "PAYMENT_REQUIRED", message: NO_KEY_MESSAGE },
    }),
  });
}

function fireSpeechResult(
  rec: FakeSpeechRecognition,
  transcript: string,
) {
  rec.onresult?.({ results: [[{ transcript }]] });
}

describe("SketchSelectionPanel — Web Speech fallback when the workspace has no OpenAI key", () => {
  it("shows Speak and no key error when transcribe returns 402 PAYMENT_REQUIRED", async () => {
    installSpeechRecognition();
    mockNoWorkspaceKey();
    render(<JobHarness />);

    await recordTranscript();

    expect(
      await screen.findByRole("button", { name: "Speak" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NO_KEY_MESSAGE)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Voice transcription requires your own OpenAI API key/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/browser's own speech service turns speech into text/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Chrome sends the audio to Google/i)).toBeInTheDocument();
  });

  it("maps a spoken note into the same suggestions and leaves the job unchanged until Accept", async () => {
    const instances = installSpeechRecognition();
    mockNoWorkspaceKey();
    render(<JobHarness />);

    await recordTranscript();
    fireEvent.click(await screen.findByRole("button", { name: "Speak" }));

    const rec = instances[0];
    expect(rec.lang).toBe("en-AU");
    expect(rec.interimResults).toBe(false);
    expect(rec.continuous).toBe(false);
    expect(rec.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireSpeechResult(rec, FIXTURE);
    });

    const roomSize = await screen.findByRole("article", {
      name: "Suggested room size",
    });
    expect(roomSize).toHaveTextContent("4 × 3.2 m");
    expect(
      screen.getByRole("article", { name: "Suggested material" }),
    ).toHaveTextContent("Vinyl / lino tiles");
    expect(
      screen.getByRole("article", { name: "Suggested water category" }),
    ).toHaveTextContent("cat2");

    const before = jobRecord();
    expect(before.materialSlug).toBeUndefined();
    expect(before.waterCategory).toBeUndefined();
    expect(before.lengthM).toBeUndefined();
    expect(before.widthM).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Accept material" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Accept water category" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept room size" }));

    await waitFor(() => {
      const after = jobRecord();
      expect(after.materialSlug).toBe("vinyl-tiles");
      expect(after.waterCategory).toBe("cat2");
      expect(after.lengthM).toBe(4);
      expect(after.widthM).toBe(3.2);
    });
  });

  it("keeps the spoken suggestions on the room that was open when Speak started", async () => {
    const instances = installSpeechRecognition();
    mockNoWorkspaceKey();
    render(<TwoRoomHarness />);

    await recordTranscript();
    fireEvent.click(await screen.findByRole("button", { name: "Speak" }));
    fireEvent.click(screen.getByRole("button", { name: "Select room B" }));

    await act(async () => {
      fireSpeechResult(instances[0], FIXTURE);
    });

    expect(
      screen.queryByRole("article", { name: "Suggested material" }),
    ).not.toBeInTheDocument();
    expect(roomsRecord()["room-a"].materialSlug).toBeUndefined();
    expect(roomsRecord()["room-b"].materialSlug).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Select room A" }));
    expect(
      await screen.findByRole("article", { name: "Suggested material" }),
    ).toHaveTextContent("Vinyl / lino tiles");
    expect(
      screen.getByRole("article", { name: "Suggested room size" }),
    ).toHaveTextContent("4 × 3.2 m");
    expect(
      screen.getByRole("article", { name: "Suggested water category" }),
    ).toHaveTextContent("cat2");

    fireEvent.click(screen.getByRole("button", { name: "Accept material" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Accept water category" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept room size" }));

    await waitFor(() => {
      expect(roomsRecord()["room-a"].materialSlug).toBe("vinyl-tiles");
      expect(roomsRecord()["room-a"].waterCategory).toBe("cat2");
      expect(roomsRecord()["room-a"].lengthM).toBe(4);
      expect(roomsRecord()["room-a"].widthM).toBe(3.2);
    });
    expect(roomsRecord()["room-b"].materialSlug).toBeUndefined();
    expect(roomsRecord()["room-b"].waterCategory).toBeUndefined();
    expect(roomsRecord()["room-b"].lengthM).toBeUndefined();
    expect(roomsRecord()["room-b"].widthM).toBeUndefined();
  });

  it("says voice notes are unavailable in this browser when SpeechRecognition is missing", async () => {
    mockNoWorkspaceKey();
    render(<JobHarness />);

    await recordTranscript();

    expect(
      await screen.findByText(/voice notes are not available in this browser/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Workspace Settings, AI Providers/i)).toBeInTheDocument();
    expect(screen.getByText(/Chrome, Edge or Safari/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Speak" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(NO_KEY_MESSAGE)).not.toBeInTheDocument();
  });

  it("shows a microphone error and stops listening when recognition errors", async () => {
    const instances = installSpeechRecognition();
    mockNoWorkspaceKey();
    render(<JobHarness />);

    await recordTranscript();
    fireEvent.click(await screen.findByRole("button", { name: "Speak" }));
    expect(screen.getByRole("button", { name: "Stop" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await act(async () => {
      instances[0].onerror?.();
    });

    expect(
      screen.getByText(/microphone blocked or no speech heard/i),
    ).toBeInTheDocument();
    const speak = screen.getByRole("button", { name: "Speak" });
    expect(speak).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByRole("button", { name: "Stop" }),
    ).not.toBeInTheDocument();
  });

  it("uses webkitSpeechRecognition when the unprefixed API is missing", async () => {
    const instances: FakeSpeechRecognition[] = [];
    class FakeRecognition implements FakeSpeechRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: FakeSpeechRecognition["onresult"] = null;
      onend: FakeSpeechRecognition["onend"] = null;
      onerror: FakeSpeechRecognition["onerror"] = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      constructor() {
        instances.push(this);
      }
    }
    (
      window as unknown as { webkitSpeechRecognition: unknown }
    ).webkitSpeechRecognition = FakeRecognition;
    mockNoWorkspaceKey();
    render(<JobHarness />);

    await recordTranscript();

    expect(
      await screen.findByRole("button", { name: "Speak" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/voice notes are not available in this browser/i),
    ).not.toBeInTheDocument();
  });

  it("stops recognition when the panel unmounts", async () => {
    const instances = installSpeechRecognition();
    mockNoWorkspaceKey();
    const view = render(<JobHarness />);

    await recordTranscript();
    fireEvent.click(await screen.findByRole("button", { name: "Speak" }));
    expect(instances[0].start).toHaveBeenCalledTimes(1);

    view.unmount();

    expect(instances[0].abort).toHaveBeenCalled();
  });
});

describe("SketchSelectionPanel — water category suggestion names a downgrade", () => {
  it("shows the current category beside a lower suggestion and does not write it yet", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ transcript: "category 1" }),
    });
    render(
      <JobHarness
        initial={{ voiceRaisedAcm: false, waterCategory: "cat3" }}
      />,
    );
    await recordTranscript();
    const card = await screen.findByRole("article", {
      name: "Suggested water category",
    });
    expect(card).toHaveTextContent("current cat3, suggested cat1");
    expect(card).toHaveTextContent(/lower/i);
    expect(jobRecord().waterCategory).toBe("cat3");
  });
});
