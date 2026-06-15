import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { applyRateLimit } from "@/lib/rate-limiter";
import { fromException } from "@/lib/api-errors";

/**
 * Client-portal authorities (client portal Phase 3).
 *
 * Lists every Authority the CLIENT still needs to approve for their claim, so the
 * portal can present them in one place. Read scope only: resolves the client from
 * the portal token, finds their reports' AuthorityFormInstances that have a
 * pending CLIENT/PROPERTY_OWNER signature, and returns each with the existing
 * per-signature token — the in-portal signing panel then submits through the
 * established sign route (IP/UA capture + atomic completion preserved).
 */

export const dynamic = "force-dynamic";

const CLIENT_ROLES = ["CLIENT", "PROPERTY_OWNER"] as const;
const OPEN_STATUSES = [
  "DRAFT",
  "PENDING_SIGNATURES",
  "PARTIALLY_SIGNED",
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const limited = await applyRateLimit(request, {
      prefix: "portal-authorities",
      key: token,
      windowMs: 10 * 60 * 1000,
      maxRequests: 60,
      failClosedOnUpstashError: true,
    });
    if (limited) return limited;

    const account = await lookupPortalAccount(token);
    if (!account) {
      return NextResponse.json(
        { error: "invalid_or_expired_link" },
        { status: 404 },
      );
    }

    const instances = await prisma.authorityFormInstance.findMany({
      where: {
        report: { clientId: account.clientId },
        status: { in: [...OPEN_STATUSES] },
        signatures: {
          some: { signatoryRole: { in: [...CLIENT_ROLES] }, signedAt: null },
        },
      },
      select: {
        id: true,
        status: true,
        authorityDescription: true,
        template: { select: { name: true } },
        signatures: {
          where: { signatoryRole: { in: [...CLIENT_ROLES] }, signedAt: null },
          select: { signatureRequestToken: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const authorities = instances
      .map((i) => ({
        id: i.id,
        name: i.template.name,
        description: i.authorityDescription,
        status: i.status,
        // Per-signature token the existing sign route accepts.
        signToken: i.signatures[0]?.signatureRequestToken ?? null,
      }))
      .filter((a) => a.signToken);

    return NextResponse.json({ data: { authorities } });
  } catch (err) {
    return fromException(request, err, { stage: "portal/authorities:get" });
  }
}
