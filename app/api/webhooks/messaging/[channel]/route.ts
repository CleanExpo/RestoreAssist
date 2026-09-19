/**
 * Text the Job In (S1) — inbound chat webhook.
 *
 * POST /api/webhooks/messaging/[channel]   (channel: "telegram" in S1)
 *
 * A linked technician texts a note. It is filed against one of their jobs as a
 * DRAFT; only their "yes" (or thumbs-up) turns it into a confirmed
 * VoiceCopilotObservation. Nothing is written for an unknown sender.
 *
 * DARK BY DEFAULT: 404 unless TEXT_JOB_IN_ENABLED === "true".
 *
 * Order of checks:
 *   flag -> known channel -> provider verification (401) -> parse
 *   -> "link CODE" (links the chat, stores no message)
 *   -> verified identity with an organisation (else reply, store nothing)
 *   -> idempotency on externalId (pre-check, then the unique index)
 *   -> confirm | job pick | note
 *
 * TENANCY: every inspection read and write goes through `jobScope`
 * (lib/messaging/job-resolution.ts): the sender's organisation AND what the
 * sender can already reach in the app.
 *
 * Retries: a failure before the message is claimed returns 500 so the
 * provider redelivers. A failure after the claim is audited, the technician
 * is asked to resend, and the route returns 200 (a redelivery would be
 * dropped as a duplicate anyway).
 */

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { recordWebhookFailure } from "@/lib/webhook-audit";
import { writeWithinInspectionScope } from "@/lib/auth/assert-tenancy";
import { parseTranscript } from "@/lib/voice/transcript-parser";
import type { ParsedObservation } from "@/lib/voice/types";
import { getChannelAdapter } from "@/lib/messaging/adapters";
import type { ChannelAdapter, InboundMessage } from "@/lib/messaging/types";
import { redeemLinkCode } from "@/lib/messaging/link-codes";
import {
  findActiveJobInScope,
  jobScope,
  resolveJob,
} from "@/lib/messaging/job-resolution";
import {
  isConfirmReply,
  parseJobPick,
  parseLinkCommand,
  REPLIES,
  summariseObservation,
} from "@/lib/messaging/reply-text";

export const runtime = "nodejs";

type Status = "draft" | "confirmed" | "unmatched" | "control";

interface StoredParse {
  type: string;
  parsed: ParsedObservation;
  confidence: string;
  candidateIds?: string[];
}

interface Sender {
  userId: string;
  organizationId: string;
}

function ok(body: Record<string, unknown> = { ok: true }) {
  return NextResponse.json(body, { status: 200 });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/** Replies are best effort: a failed send must not trigger a redelivery. */
async function safeReply(
  adapter: ChannelAdapter,
  msg: InboundMessage,
  text: string,
): Promise<void> {
  try {
    await adapter.reply(msg.replyTo, text);
  } catch (error) {
    await recordWebhookFailure({
      provider: `messaging-${adapter.channel}`,
      externalEventId: msg.externalId,
      stage: "reply",
      error,
    });
  }
}

class DuplicateDelivery extends Error {}

/** Claim the delivery. Throws DuplicateDelivery when it was already seen. */
async function claim(
  msg: InboundMessage,
  channel: string,
  sender: Sender,
  data: {
    status: Status;
    inspectionId?: string | null;
    parsed?: StoredParse;
  },
): Promise<{ id: string; createdAt: Date }> {
  try {
    return await prisma.inboundJobMessage.create({
      data: {
        organizationId: sender.organizationId,
        userId: sender.userId,
        inspectionId: data.inspectionId ?? null,
        channel,
        externalId: msg.externalId,
        body: msg.text,
        mediaRefs: msg.mediaRefs,
        parsed: (data.parsed ?? undefined) as Prisma.InputJsonValue | undefined,
        status: data.status,
      },
      select: { id: true, createdAt: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateDelivery();
    throw error;
  }
}

async function handleConfirm(
  adapter: ChannelAdapter,
  msg: InboundMessage,
  sender: Sender,
  claimedAt: Date,
): Promise<void> {
  const draft = await prisma.inboundJobMessage.findFirst({
    where: {
      organizationId: sender.organizationId,
      userId: sender.userId,
      status: "draft",
      inspectionId: { not: null },
      createdAt: { lte: claimedAt },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, inspectionId: true, body: true, parsed: true },
  });
  const scope = draft?.inspectionId
    ? await jobScope(sender.userId, sender.organizationId)
    : null;
  const ref =
    draft?.inspectionId && scope
      ? await findActiveJobInScope(draft.inspectionId, scope)
      : null;
  if (!draft) {
    await safeReply(adapter, msg, REPLIES.nothingToConfirm);
    return;
  }
  if (!scope || !ref) {
    await safeReply(adapter, msg, REPLIES.confirmFailed);
    return;
  }
  const inspectionId = ref.id;
  const stored = draft.parsed as unknown as StoredParse;
  const now = new Date();

  const saved = await writeWithinInspectionScope(
    { AND: [scope, { id: inspectionId }] },
    { updatedAt: now },
    async (tx) => {
      const moved = await tx.inboundJobMessage.updateMany({
        where: { id: draft.id, status: "draft" },
        data: { status: "confirmed" },
      });
      if (moved.count !== 1) return null;
      const sessionId = randomUUID();
      await tx.voiceCopilotSession.create({
        data: {
          id: sessionId,
          inspectionId,
          userId: sender.userId,
          mode: "text",
          state: "ended",
          missingItems: [],
          startedAt: now,
          endedAt: now,
          expiresAt: now,
        },
        select: { id: true },
      });
      await tx.voiceCopilotObservation.create({
        data: {
          id: randomUUID(),
          sessionId,
          type: stored.type,
          rawTranscript: draft.body,
          parsed: stored.parsed as Prisma.InputJsonValue,
          confidence: stored.confidence,
          needsConfirmation: false,
          confirmedAt: now,
          storedAt: now,
        },
        select: { id: true },
      });
      return true;
    },
  );

  if (!saved) {
    await safeReply(adapter, msg, REPLIES.confirmFailed);
    return;
  }
  await safeReply(
    adapter,
    msg,
    REPLIES.confirmed(ref, summariseObservation(stored.parsed, draft.body)),
  );
}

async function handlePick(
  adapter: ChannelAdapter,
  msg: InboundMessage,
  sender: Sender,
  pick: number,
  claimedAt: Date,
): Promise<void> {
  const pending = await prisma.inboundJobMessage.findFirst({
    where: {
      organizationId: sender.organizationId,
      userId: sender.userId,
      status: "unmatched",
      createdAt: { lte: claimedAt },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, body: true, parsed: true },
  });
  if (!pending) {
    await safeReply(adapter, msg, REPLIES.nothingToPick);
    return;
  }
  const stored = pending.parsed as unknown as StoredParse;
  const candidateId = stored.candidateIds?.[pick - 1];
  const scope = await jobScope(sender.userId, sender.organizationId);
  const job =
    candidateId && scope ? await findActiveJobInScope(candidateId, scope) : null;
  if (!job) {
    await safeReply(adapter, msg, REPLIES.pickOutOfRange);
    return;
  }
  const moved = await prisma.inboundJobMessage.updateMany({
    where: { id: pending.id, status: "unmatched" },
    data: { status: "draft", inspectionId: job.id },
  });
  if (moved.count !== 1) {
    await safeReply(adapter, msg, REPLIES.nothingToPick);
    return;
  }
  await safeReply(
    adapter,
    msg,
    REPLIES.draft(job, summariseObservation(stored.parsed, pending.body)),
  );
}

async function handleNote(
  adapter: ChannelAdapter,
  msg: InboundMessage,
  sender: Sender,
): Promise<void> {
  const { type, parsed, confidence } = parseTranscript(msg.text);
  const scope = await jobScope(sender.userId, sender.organizationId);
  const resolution = scope
    ? await resolveJob(msg.text, sender.userId, scope)
    : { kind: "unmatched" as const, candidates: [], missingNumber: null };

  if (resolution.kind === "matched") {
    await claim(msg, adapter.channel, sender, {
      status: "draft",
      inspectionId: resolution.job.id,
      parsed: { type, parsed, confidence },
    });
    await safeReply(
      adapter,
      msg,
      REPLIES.draft(resolution.job, summariseObservation(parsed, msg.text)),
    );
    return;
  }

  await claim(msg, adapter.channel, sender, {
    status: "unmatched",
    parsed: {
      type,
      parsed,
      confidence,
      candidateIds: resolution.candidates.map((c) => c.id),
    },
  });
  await safeReply(
    adapter,
    msg,
    REPLIES.pickJob(resolution.candidates, resolution.missingNumber),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> },
) {
  if (process.env.TEXT_JOB_IN_ENABLED !== "true") {
    return apiError(req, { code: "NOT_FOUND", message: "Not found", status: 404 });
  }
  const { channel } = await params;
  const adapter = getChannelAdapter(channel);
  if (!adapter) {
    return apiError(req, { code: "NOT_FOUND", message: "Not found", status: 404 });
  }

  const rawBody = await req.text();
  if (!adapter.verify(req, rawBody)) {
    await recordWebhookFailure({
      provider: `messaging-${channel}`,
      stage: "verify",
      error: new Error("Webhook verification failed"),
      request: req,
    });
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const msg = adapter.parse(rawBody);
  if (!msg) return ok({ ok: true, ignored: true });

  let claimed = false;
  try {
    const linkCode = parseLinkCommand(msg.text);
    if (linkCode) {
      const userId = await redeemLinkCode(linkCode, channel, msg.address);
      await safeReply(adapter, msg, userId ? REPLIES.linked : REPLIES.badCode);
      return ok();
    }

    const identity = await prisma.messagingIdentity.findUnique({
      where: { channel_address: { channel, address: msg.address } },
      select: {
        userId: true,
        verifiedAt: true,
        user: { select: { organizationId: true } },
      },
    });
    if (!identity?.verifiedAt) {
      await safeReply(adapter, msg, REPLIES.notLinked);
      return ok();
    }
    const organizationId = identity.user.organizationId;
    if (!organizationId) {
      await safeReply(adapter, msg, REPLIES.noOrganisation);
      return ok();
    }
    const sender: Sender = { userId: identity.userId, organizationId };

    const seen = await prisma.inboundJobMessage.findUnique({
      where: { externalId: msg.externalId },
      select: { id: true },
    });
    if (seen) return ok({ ok: true, duplicate: true });

    const pick = parseJobPick(msg.text);
    if (isConfirmReply(msg.text) || pick !== null) {
      const control = await claim(msg, channel, sender, { status: "control" });
      claimed = true;
      if (pick !== null) {
        await handlePick(adapter, msg, sender, pick, control.createdAt);
      } else {
        await handleConfirm(adapter, msg, sender, control.createdAt);
      }
      return ok();
    }

    await handleNote(adapter, msg, sender);
    return ok();
  } catch (error) {
    if (error instanceof DuplicateDelivery) {
      return ok({ ok: true, duplicate: true });
    }
    await recordWebhookFailure({
      provider: `messaging-${channel}`,
      externalEventId: msg.externalId,
      stage: claimed ? "process" : "claim",
      error,
      request: req,
    });
    if (!claimed) {
      return apiError(req, {
        code: "INTERNAL",
        message: "Processing failed",
        status: 500,
      });
    }
    await safeReply(adapter, msg, REPLIES.tryAgain);
    return ok();
  }
}
