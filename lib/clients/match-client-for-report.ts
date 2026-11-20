import type { Prisma } from "@prisma/client";

export interface ReportClientInput {
  name: string;
  email: string | null;
  phone: string | null;
  address: string;
}

export interface ReportClientMatch {
  clientId: string | null;
  warning?: string;
}

/**
 * Find or create the Client a new report belongs to.
 *
 * Runs inside the report-creation transaction so a refusal leaves no client
 * change behind.
 *
 * A client is matched by EMAIL only. A name is not an identity: two customers
 * called "John Smith" are two people, and the portal link, authority forms and
 * photos hang off the Client row, so merging them showed one customer the
 * other's job (walkthrough finding 2). The stored email and address are never
 * rewritten from a report; a blank phone is filled in.
 */
export async function matchClientForReport(
  tx: Prisma.TransactionClient,
  userId: string,
  input: ReportClientInput,
): Promise<ReportClientMatch> {
  const name = input.name.trim();
  const existing = input.email
    ? await tx.client.findFirst({
        where: {
          userId,
          isSample: false,
          email: { equals: input.email, mode: "insensitive" },
        },
        select: { id: true, phone: true },
      })
    : null;
  if (existing) {
    if (!existing.phone && input.phone) {
      await tx.client.update({
        where: { id: existing.id, userId },
        data: { phone: input.phone },
      });
    }
    return { clientId: existing.id };
  }
  if (input.email) {
    const created = await tx.client.create({
      data: {
        name,
        email: input.email,
        phone: input.phone || null,
        address: input.address.trim() || null,
        status: "ACTIVE",
        userId,
      },
      select: { id: true },
    });
    return { clientId: created.id };
  }
  return {
    clientId: null,
    warning:
      "Report saved without a client link. Add the client's email to create their client record.",
  };
}
