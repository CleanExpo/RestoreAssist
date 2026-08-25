import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

const { create, findUnique, update, updateMany } = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { outboundEmailDelivery: { create, findUnique, update, updateMany } },
}));

import {
  deliverEmailOnce,
  EmailDeliveryPending,
} from "@/lib/email-delivery-ledger";
import { EmailDeliveryNotAttempted } from "@/lib/email-delivery-errors";
import { EmailDeliveryRejected } from "@/lib/email-delivery-errors";

function identityHash(
  key: string,
  kind: string,
  recipient: string,
  payload: string,
) {
  return createHash("sha256")
    .update(JSON.stringify([key, kind, recipient, payload]))
    .digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({});
  update.mockResolvedValue({});
  updateMany.mockResolvedValue({ count: 1 });
});

describe("durable outbound delivery ownership", () => {
  it("stores SENT only after a provider receipt", async () => {
    const send = vi.fn().mockResolvedValue({
      data: { id: "provider-1" },
      provider: "mailtrap",
    });
    const result = await deliverEmailOnce({
      idempotencyKey: "welcome:u1",
      kind: "WELCOME",
      recipient: "USER@EXAMPLE.COM",
      payloadIdentity: "payload-v1",
      send,
    });
    expect(result).toMatchObject({ messageId: "provider-1", replayed: false });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SENT",
          provider: "mailtrap",
          providerMessageId: "provider-1",
        }),
      }),
    );
  });

  it("marks a lost/failed provider result AMBIGUOUS and never retries it", async () => {
    const send = vi.fn().mockRejectedValue(new Error("response timed out"));
    await expect(
      deliverEmailOnce({
        idempotencyKey: "invite:1",
        kind: "INVITE",
        recipient: "user@example.com",
        payloadIdentity: "payload-v1",
        send,
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryPending);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "AMBIGUOUS" }),
      }),
    );

    create.mockRejectedValueOnce({ code: "P2002" });
    findUnique.mockResolvedValueOnce({
      payloadHash: identityHash(
        "invite:1",
        "INVITE",
        "user@example.com",
        "payload-v1",
      ),
      status: "AMBIGUOUS",
    });
    await expect(
      deliverEmailOnce({
        idempotencyKey: "invite:1",
        kind: "INVITE",
        recipient: "user@example.com",
        payloadIdentity: "payload-v1",
        send,
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryPending);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("replays a durable SENT receipt without provider I/O", async () => {
    create.mockRejectedValueOnce({ code: "P2002" });
    findUnique.mockResolvedValueOnce({
      payloadHash: identityHash(
        "same-key",
        "INVITE",
        "user@example.com",
        "same",
      ),
      status: "SENT",
      providerMessageId: "provider-existing",
    });
    const send = vi.fn();
    await expect(
      deliverEmailOnce({
        idempotencyKey: "same-key",
        kind: "INVITE",
        recipient: "user@example.com",
        payloadIdentity: "same",
        send,
      }),
    ).resolves.toMatchObject({
      messageId: "provider-existing",
      replayed: true,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("marks proven pre-provider failures FAILED and safely reclaims them", async () => {
    const firstSend = vi
      .fn()
      .mockRejectedValue(
        new EmailDeliveryNotAttempted("provider is not configured"),
      );
    await expect(
      deliverEmailOnce({
        idempotencyKey: "retryable-key",
        kind: "WELCOME",
        recipient: "user@example.com",
        payloadIdentity: "retryable-payload",
        send: firstSend,
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryNotAttempted);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );

    create.mockRejectedValueOnce({ code: "P2002" });
    findUnique.mockResolvedValueOnce({
      payloadHash: identityHash(
        "retryable-key",
        "WELCOME",
        "user@example.com",
        "retryable-payload",
      ),
      status: "FAILED",
    });
    updateMany.mockResolvedValueOnce({ count: 1 });
    const secondSend = vi
      .fn()
      .mockResolvedValue({ data: { id: "provider-retry" } });
    await expect(
      deliverEmailOnce({
        idempotencyKey: "retryable-key",
        kind: "WELCOME",
        recipient: "user@example.com",
        payloadIdentity: "retryable-payload",
        send: secondSend,
      }),
    ).resolves.toMatchObject({ messageId: "provider-retry" });
    expect(secondSend).toHaveBeenCalledTimes(1);
  });

  it("does not replay a receipt across recipient or message-kind boundaries", async () => {
    create.mockRejectedValueOnce({ code: "P2002" });
    findUnique.mockResolvedValueOnce({
      payloadHash: identityHash("shared-key", "A", "a@example.com", "same"),
      status: "SENT",
      providerMessageId: "provider-a",
    });
    const send = vi.fn();
    await expect(
      deliverEmailOnce({
        idempotencyKey: "shared-key",
        kind: "B",
        recipient: "b@example.com",
        payloadIdentity: "same",
        send,
      }),
    ).rejects.toThrow("conflicts with another payload");
    expect(send).not.toHaveBeenCalled();
  });

  it("turns an expired PENDING lease into AMBIGUOUS instead of wedging forever", async () => {
    create.mockRejectedValueOnce({ code: "P2002" });
    findUnique.mockResolvedValueOnce({
      payloadHash: identityHash(
        "stale-key",
        "INVITE",
        "user@example.com",
        "same",
      ),
      status: "PENDING",
      leaseOwner: "dead-worker",
      leaseExpiresAt: new Date(Date.now() - 1_000),
    });
    await expect(
      deliverEmailOnce({
        idempotencyKey: "stale-key",
        kind: "INVITE",
        recipient: "user@example.com",
        payloadIdentity: "same",
        send: vi.fn(),
      }),
    ).rejects.toMatchObject({ state: "AMBIGUOUS" });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "AMBIGUOUS" }),
      }),
    );
  });

  it("records a definitive provider rejection as FAILED", async () => {
    await expect(
      deliverEmailOnce({
        idempotencyKey: "rejected-key",
        kind: "INVITE",
        recipient: "user@example.com",
        payloadIdentity: "same",
        send: vi
          .fn()
          .mockRejectedValue(new EmailDeliveryRejected("provider HTTP 401")),
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryRejected);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("makes a post-provider ledger failure explicitly ambiguous", async () => {
    updateMany.mockRejectedValueOnce(new Error("database write unavailable"));
    await expect(
      deliverEmailOnce({
        idempotencyKey: "finalise-failure",
        kind: "INVITE",
        recipient: "user@example.com",
        payloadIdentity: "same",
        send: vi.fn().mockResolvedValue({ data: { id: "provider-accepted" } }),
      }),
    ).rejects.toMatchObject({ state: "AMBIGUOUS" });
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "AMBIGUOUS" }),
      }),
    );
  });
});
