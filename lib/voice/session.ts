/**
 * RA-VOI-001: VoiceSession durable state machine.
 *
 * Voice copilot sessions and observations are persisted so reconnects and
 * serverless instance changes do not lose active field capture state.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type {
  VoiceSession,
  VoiceCopilotMode,
  VoiceObservation,
  ObservationType,
  ParsedObservation,
  S500CompletionItem,
} from "./types";

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

type StoredVoiceSession = {
  id: string;
  inspectionId: string;
  userId: string;
  mode: string;
  state: string;
  missingItems: unknown;
  startedAt: Date;
  endedAt: Date | null;
  observations: StoredVoiceObservation[];
};

type StoredVoiceObservation = {
  id: string;
  sessionId: string;
  rawTranscript: string;
  type: string;
  parsed: unknown;
  confidence: string;
  needsConfirmation: boolean;
  confirmedAt: Date | null;
  storedAt: Date | null;
  createdAt: Date;
};

function expiresAtFrom(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

function asIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function mapObservation(record: StoredVoiceObservation): VoiceObservation {
  return {
    id: record.id,
    sessionId: record.sessionId,
    rawTranscript: record.rawTranscript,
    type: record.type as ObservationType,
    parsed: record.parsed as ParsedObservation,
    confidence: record.confidence as "high" | "medium" | "low",
    needsConfirmation: record.needsConfirmation,
    confirmedAt: asIso(record.confirmedAt),
    storedAt: asIso(record.storedAt),
    createdAt: record.createdAt.toISOString(),
  };
}

function mapSession(record: StoredVoiceSession): VoiceSession {
  return {
    sessionId: record.id,
    inspectionId: record.inspectionId,
    userId: record.userId,
    mode: record.mode as VoiceCopilotMode,
    state: record.state as VoiceSession["state"],
    startedAt: record.startedAt.toISOString(),
    endedAt: asIso(record.endedAt),
    observations: record.observations.map(mapObservation),
    missingItems: Array.isArray(record.missingItems)
      ? (record.missingItems as S500CompletionItem[])
      : [],
  };
}

async function findActiveSession(sessionId: string): Promise<VoiceSession | null> {
  const now = new Date();
  const record = (await (prisma as any).voiceCopilotSession.findFirst({
    where: {
      id: sessionId,
      endedAt: null,
      expiresAt: { gt: now },
    },
    include: {
      observations: { orderBy: { createdAt: "asc" } },
    },
  })) as StoredVoiceSession | null;

  return record ? mapSession(record) : null;
}

export async function createSession(
  inspectionId: string,
  userId: string,
  mode: VoiceCopilotMode = "assisted",
): Promise<VoiceSession> {
  const now = new Date();
  const record = (await (prisma as any).voiceCopilotSession.create({
    data: {
      id: randomUUID(),
      inspectionId,
      userId,
      mode,
      state: "idle",
      missingItems: [],
      startedAt: now,
      expiresAt: expiresAtFrom(now),
    },
    include: {
      observations: { orderBy: { createdAt: "asc" } },
    },
  })) as StoredVoiceSession;

  return mapSession(record);
}

export async function getSession(sessionId: string): Promise<VoiceSession | null> {
  return findActiveSession(sessionId);
}

export async function updateSessionState(
  sessionId: string,
  state: VoiceSession["state"],
): Promise<void> {
  const now = new Date();
  await (prisma as any).voiceCopilotSession.updateMany({
    where: {
      id: sessionId,
      endedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      state,
      expiresAt: expiresAtFrom(now),
    },
  });
}

export async function addObservation(
  sessionId: string,
  type: ObservationType,
  rawTranscript: string,
  parsed: ParsedObservation,
  confidence: "high" | "medium" | "low",
  needsConfirmation: boolean,
): Promise<VoiceObservation | null> {
  const now = new Date();
  const observationId = randomUUID();

  const observation = await prisma.$transaction(async (tx) => {
    const updateResult = await (tx as any).voiceCopilotSession.updateMany({
      where: {
        id: sessionId,
        endedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        expiresAt: expiresAtFrom(now),
      },
    });

    if (updateResult.count === 0) return null;

    return (await (tx as any).voiceCopilotObservation.create({
      data: {
        id: observationId,
        sessionId,
        type,
        rawTranscript,
        parsed,
        confidence,
        needsConfirmation,
        createdAt: now,
      },
    })) as StoredVoiceObservation;
  });

  return observation ? mapObservation(observation) : null;
}

export async function confirmObservation(
  sessionId: string,
  observationId: string,
): Promise<VoiceObservation | null> {
  const now = new Date();
  const observation = (await (prisma as any).voiceCopilotObservation.updateMany({
    where: {
      id: observationId,
      sessionId,
      session: {
        endedAt: null,
        expiresAt: { gt: now },
      },
    },
    data: {
      confirmedAt: now,
      storedAt: now,
    },
  })) as { count: number };

  if (observation.count === 0) return null;

  const record = (await (prisma as any).voiceCopilotObservation.findUnique({
    where: { id: observationId },
  })) as StoredVoiceObservation | null;

  return record ? mapObservation(record) : null;
}

export async function markObservationStored(
  sessionId: string,
  observationId: string,
): Promise<VoiceObservation | null> {
  const now = new Date();
  const observation = (await (prisma as any).voiceCopilotObservation.updateMany({
    where: {
      id: observationId,
      sessionId,
      session: {
        endedAt: null,
        expiresAt: { gt: now },
      },
    },
    data: { storedAt: now },
  })) as { count: number };

  if (observation.count === 0) return null;

  const record = (await (prisma as any).voiceCopilotObservation.findUnique({
    where: { id: observationId },
  })) as StoredVoiceObservation | null;

  return record ? mapObservation(record) : null;
}

export async function updateMissingItems(
  sessionId: string,
  items: S500CompletionItem[],
): Promise<void> {
  const now = new Date();
  await (prisma as any).voiceCopilotSession.updateMany({
    where: {
      id: sessionId,
      endedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      missingItems: items,
      expiresAt: expiresAtFrom(now),
    },
  });
}

export async function endSession(
  sessionId: string,
  userId?: string,
  inspectionId?: string,
): Promise<boolean> {
  const now = new Date();
  const result = (await (prisma as any).voiceCopilotSession.updateMany({
    where: {
      id: sessionId,
      ...(userId ? { userId } : {}),
      ...(inspectionId ? { inspectionId } : {}),
      endedAt: null,
    },
    data: {
      state: "ended",
      endedAt: now,
      expiresAt: now,
    },
  })) as { count: number };

  return result.count > 0;
}
