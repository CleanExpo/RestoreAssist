/**
 * POST /api/whs/swms/[id]/sign
 *
 * Technician signature capture for a SWMS record.
 * Every technician on site must sign before work begins.
 *
 * Body: { signatoryName: string, signatoryRole?: string }
 *
 * The record stores the first signatory in signedByUserId/signedAt.
 * Additional signatories are appended to contentJson.signatures[].
 *
 * P1-WHS2 — RA-1130
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface SignatureEntry {
  userId: string;
  name: string;
  role?: string;
  signedAt: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  let body: { signatoryName?: string; signatoryRole?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const signatoryName = body.signatoryName?.trim() || session.user.name || "Unknown";

  const record = await (prisma as any).swmsDraft.findUnique({
    where: { id },
    include: { inspection: { select: { userId: true } } },
  });

  if (!record) {
    return NextResponse.json({ error: "SWMS not found" }, { status: 404 });
  }

  // Parse existing content and append signature
  let content: Record<string, unknown> & { signatures?: SignatureEntry[] };
  try {
    content = JSON.parse(record.contentJson);
  } catch {
    content = {};
  }

  const signatures: SignatureEntry[] = Array.isArray(content.signatures)
    ? content.signatures
    : [];

  const newSignature: SignatureEntry = {
    userId: session.user.id,
    name: signatoryName,
    role: body.signatoryRole?.trim(),
    signedAt: new Date().toISOString(),
  };

  // Prevent duplicate signature from same user
  if (signatures.some((s) => s.userId === session.user.id)) {
    return NextResponse.json({ error: "Already signed by this user" }, { status: 409 });
  }

  signatures.push(newSignature);
  content.signatures = signatures;

  const updated = await (prisma as any).swmsDraft.update({
    where: { id },
    data: {
      contentJson: JSON.stringify(content),
      // First signatory sets the primary signedAt/signedByUserId fields
      signedAt: record.signedAt ?? new Date(),
      signedByUserId: record.signedByUserId ?? session.user.id,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({
    id: updated.id,
    signatureCount: signatures.length,
    signatures,
    signedAt: updated.signedAt,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await (prisma as any).swmsDraft.findUnique({
    where: { id: params.id },
  });

  if (!record) {
    return NextResponse.json({ error: "SWMS not found" }, { status: 404 });
  }

  let content: Record<string, unknown> & { signatures?: SignatureEntry[] } = {};
  try {
    content = JSON.parse(record.contentJson);
  } catch {}

  const signatures: SignatureEntry[] = Array.isArray(content.signatures)
    ? content.signatures
    : [];

  // QR code URL for site posting — links to sign endpoint
  const appUrl = process.env.NEXTAUTH_URL ?? "https://restoreassist.app";
  const qrTarget = `${appUrl}/whs/swms/${record.id}/sign`;

  return NextResponse.json({
    id: record.id,
    inspectionId: record.inspectionId,
    signatureCount: signatures.length,
    signatures,
    signedAt: record.signedAt,
    qrCodeTarget: qrTarget,
  });
}
