import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { canonicalEmail } from "@/lib/email-identity";
import { hasProviderReceipt } from "@/lib/email-retry";
import {
  EmailDeliveryNotAttempted,
  EmailDeliveryRejected,
} from "@/lib/email-delivery-errors";

export const EMAIL_DELIVERY_LEASE_MS = 2 * 60 * 1000;

export class EmailDeliveryPending extends Error {
  constructor(public readonly state: "PENDING" | "AMBIGUOUS") {
    super(`Email delivery is ${state.toLowerCase()}; automatic resend refused`);
  }
}

function receiptId(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!value || typeof value !== "object") return null;
  const id = (value as { data?: { id?: unknown } }).data?.id;
  return typeof id === "string" ? id.trim() || null : null;
}

function providerName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const provider = (value as { provider?: unknown }).provider;
  return typeof provider === "string" ? provider.trim() || null : null;
}

function isUnique(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Claims one stable message identity before provider I/O. Any exception after
 * the provider call is conservatively AMBIGUOUS, never blindly retried.
 */
export async function deliverEmailOnce<T>({
  idempotencyKey,
  kind,
  recipient,
  payloadIdentity,
  send,
}: {
  idempotencyKey: string;
  kind: string;
  recipient: string;
  payloadIdentity: string;
  send: () => Promise<T>;
}): Promise<{ messageId: string; replayed: boolean; result?: T }> {
  const ledger = (prisma as any).outboundEmailDelivery;
  const canonicalRecipient = canonicalEmail(recipient);
  // Bind the durable identity intrinsically. Callers cannot accidentally reuse
  // a receipt for a different message kind or recipient by supplying the same
  // payloadIdentity string.
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify([
        idempotencyKey,
        kind,
        canonicalRecipient,
        payloadIdentity,
      ]),
    )
    .digest("hex");
  const leaseOwner = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + EMAIL_DELIVERY_LEASE_MS);

  try {
    await ledger.create({
      data: {
        idempotencyKey,
        kind,
        recipient: canonicalRecipient,
        status: "PENDING",
        payloadHash,
        attemptCount: 1,
        leaseOwner,
        leaseExpiresAt,
      },
    });
  } catch (error) {
    if (!isUnique(error)) throw error;
    const existing = await ledger.findUnique({ where: { idempotencyKey } });
    if (!existing || existing.payloadHash !== payloadHash) {
      throw new Error(
        "Outbound email idempotency key conflicts with another payload",
      );
    }
    if (existing.status === "SENT" && existing.providerMessageId) {
      return { messageId: existing.providerMessageId, replayed: true };
    }
    if (existing.status === "PENDING") {
      const stale =
        !existing.leaseExpiresAt ||
        new Date(existing.leaseExpiresAt).getTime() <= Date.now();
      if (stale) {
        await ledger.updateMany({
          where: {
            idempotencyKey,
            status: "PENDING",
            payloadHash,
            leaseOwner: existing.leaseOwner ?? null,
          },
          data: {
            status: "AMBIGUOUS",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError:
              "Delivery worker lease expired before a durable outcome was recorded",
          },
        });
        throw new EmailDeliveryPending("AMBIGUOUS");
      }
      throw new EmailDeliveryPending("PENDING");
    }
    if (existing.status === "FAILED") {
      const reclaimed = await ledger.updateMany({
        where: { idempotencyKey, status: "FAILED", payloadHash },
        data: {
          status: "PENDING",
          attemptCount: { increment: 1 },
          lastError: null,
          leaseOwner,
          leaseExpiresAt,
        },
      });
      if (reclaimed.count === 1) {
        // This caller now owns the retry; continue to provider I/O below.
      } else {
        throw new EmailDeliveryPending("PENDING");
      }
    } else {
      throw new EmailDeliveryPending("AMBIGUOUS");
    }
  }

  try {
    const result = await send();
    if (!hasProviderReceipt(result)) {
      throw new Error("Email provider returned no confirmed message ID");
    }
    const messageId = receiptId(result);
    if (!messageId) throw new Error("Email receipt could not be normalised");
    const provider = providerName(result);
    const finalised = await ledger.updateMany({
      where: { idempotencyKey, status: "PENDING", payloadHash, leaseOwner },
      data: {
        status: "SENT",
        provider,
        providerMessageId: messageId,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (finalised.count !== 1) {
      throw new Error(
        "Provider accepted email but delivery ownership could not be finalised",
      );
    }
    return { messageId, replayed: false, result };
  } catch (error) {
    if (
      error instanceof EmailDeliveryNotAttempted ||
      error instanceof EmailDeliveryRejected
    ) {
      await ledger.updateMany({
        where: { idempotencyKey, status: "PENDING", payloadHash, leaseOwner },
        data: {
          status: "FAILED",
          lastError: error.message.slice(0, 500),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      throw error;
    }
    await ledger
      .updateMany({
        where: { idempotencyKey, status: "PENDING", payloadHash, leaseOwner },
        data: {
          status: "AMBIGUOUS",
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError:
            error instanceof Error ? error.message.slice(0, 500) : "unknown",
        },
      })
      .catch(() => {});
    throw new EmailDeliveryPending("AMBIGUOUS");
  }
}
