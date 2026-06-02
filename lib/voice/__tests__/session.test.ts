import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    voiceCopilotSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  addObservation,
  createSession,
  endSession,
  getSession,
  updateSessionState,
} from "../session";

const voiceCopilotSession = (
  prisma as unknown as {
    voiceCopilotSession: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  }
).voiceCopilotSession;

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "voice-session-1",
    inspectionId: "inspection-1",
    userId: "user-1",
    mode: "assisted",
    state: "idle",
    observations: [],
    missingItems: [],
    startedAt: new Date("2026-05-24T00:00:00.000Z"),
    endedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.RESTOREASSIST_VOICE_SESSION_STORE;
});

describe("voice session persistence", () => {
  it("creates sessions through durable storage by default", async () => {
    voiceCopilotSession.create.mockResolvedValueOnce(sessionRow());

    const result = await createSession("inspection-1", "user-1", "guided");

    expect(voiceCopilotSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inspectionId: "inspection-1",
          userId: "user-1",
          mode: "guided",
          state: "idle",
        }),
      }),
    );
    expect(result.sessionId).toBe("voice-session-1");
    expect(result.observations).toEqual([]);
  });

  it("returns null for ended sessions so observations cannot append", async () => {
    voiceCopilotSession.findUnique.mockResolvedValueOnce(
      sessionRow({ endedAt: new Date("2026-05-24T01:00:00.000Z") }),
    );

    await expect(getSession("voice-session-1")).resolves.toBeNull();
  });

  it("appends observations to the persisted session document", async () => {
    voiceCopilotSession.findUnique.mockResolvedValueOnce(
      sessionRow({
        observations: [
          {
            id: "existing",
            sessionId: "voice-session-1",
            rawTranscript: "Existing note",
            type: "general_note",
            parsed: { note: "Existing note" },
            confidence: "medium",
            needsConfirmation: false,
            createdAt: "2026-05-24T00:00:00.000Z",
          },
        ],
      }),
    );
    voiceCopilotSession.update.mockResolvedValueOnce({});

    const observation = await addObservation(
      "voice-session-1",
      "moisture_reading",
      "Kitchen wall is 42 percent",
      { room: "Kitchen", value: 42, unit: "%" },
      "high",
      false,
    );

    expect(observation?.type).toBe("moisture_reading");
    expect(voiceCopilotSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "voice-session-1" },
        data: expect.objectContaining({
          observations: expect.arrayContaining([
            expect.objectContaining({ id: "existing" }),
            expect.objectContaining({ type: "moisture_reading" }),
          ]),
        }),
      }),
    );
  });

  it("updates state and ends sessions with guarded writes", async () => {
    voiceCopilotSession.updateMany.mockResolvedValueOnce({ count: 1 });
    await updateSessionState("voice-session-1", "processing");

    expect(voiceCopilotSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "voice-session-1",
          endedAt: null,
        }),
        data: expect.objectContaining({ state: "processing" }),
      }),
    );

    voiceCopilotSession.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(endSession("voice-session-1")).resolves.toBe(true);
    expect(voiceCopilotSession.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: "ended",
          endedAt: expect.any(Date),
        }),
      }),
    );
  });
});
