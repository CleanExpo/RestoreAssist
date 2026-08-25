/**
 * Explicit operator reconciliation for an AMBIGUOUS outbound email receipt.
 * Default mode is read-only. --apply requires named evidence and an operator.
 */
import { prisma } from "@/lib/prisma";

function value(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function main() {
  const id = value("--id");
  if (!id) throw new Error("--id is required");
  const row = await (prisma as any).outboundEmailDelivery.findUnique({
    where: { id },
  });
  if (!row) throw new Error("delivery receipt not found");

  if (!process.argv.includes("--apply")) {
    console.log(
      JSON.stringify(
        {
          id: row.id,
          kind: row.kind,
          status: row.status,
          provider: row.provider ?? null,
          attemptCount: row.attemptCount,
          leaseActive:
            row.status === "PENDING" &&
            Boolean(row.leaseExpiresAt && row.leaseExpiresAt > new Date()),
          leaseExpiresAt: row.leaseExpiresAt,
          providerMessageIdPresent: Boolean(row.providerMessageId),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
        null,
        2,
      ),
    );
    return;
  }

  let reconcilableStatus = row.status;
  if (
    row.status === "PENDING" &&
    row.leaseExpiresAt &&
    row.leaseExpiresAt <= new Date()
  ) {
    const expired = await (prisma as any).outboundEmailDelivery.updateMany({
      where: {
        id,
        status: "PENDING",
        leaseOwner: row.leaseOwner,
        leaseExpiresAt: { lte: new Date() },
      },
      data: {
        status: "AMBIGUOUS",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError:
          "Delivery worker lease expired before a durable outcome was recorded",
      },
    });
    if (expired.count !== 1) throw new Error("receipt changed concurrently");
    reconcilableStatus = "AMBIGUOUS";
  }
  if (reconcilableStatus !== "AMBIGUOUS") {
    throw new Error(
      "only AMBIGUOUS or lease-expired PENDING receipts may be reconciled",
    );
  }
  const outcome = value("--outcome");
  const evidence = value("--evidence");
  const operator = value("--operator");
  const providerMessageId = value("--provider-message-id");
  if (!evidence || evidence.length < 12 || !operator || operator.length < 3) {
    throw new Error("--evidence and --operator are required for --apply");
  }
  if (outcome !== "sent" && outcome !== "failed") {
    throw new Error("--outcome must be sent or failed");
  }
  if (outcome === "sent" && !providerMessageId) {
    throw new Error("--provider-message-id is required for sent outcome");
  }

  const updated = await (prisma as any).outboundEmailDelivery.updateMany({
    where: { id, status: "AMBIGUOUS" },
    data: {
      status: outcome === "sent" ? "SENT" : "FAILED",
      providerMessageId: outcome === "sent" ? providerMessageId : null,
      resolvedAt: new Date(),
      resolutionEvidence: evidence.slice(0, 1000),
      resolvedBy: operator.slice(0, 200),
      lastError: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  if (updated.count !== 1) throw new Error("receipt changed concurrently");
  console.log(JSON.stringify({ id, reconciled: true, outcome }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
