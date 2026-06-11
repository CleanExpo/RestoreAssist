import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { applyRateLimit } from "@/lib/rate-limiter";
import { verifyBotId } from "@/lib/auth/botid";
import { validateCsrf } from "@/lib/csrf";
import { sanitizeString } from "@/lib/sanitize";
import { decodeImageDataUrl } from "@/lib/portal/image-data-url";
import { SupabaseStorageProvider } from "@/lib/storage/supabase-provider";

/**
 * Client-portal evidence upload (client portal Phase 2; plan D2).
 *
 * Token-gated public write: the client's portal link lets them submit images +
 * a brief description. Defences before any write: rate-limit (token-keyed,
 * fail-closed) → BotID → CSRF → portal-account lookup → magic-byte + size
 * validation. The inspection is resolved FROM THE TOKEN's client only (no
 * client-supplied id). Submissions land in ClientEvidenceSubmission (quarantine)
 * — never EvidenceItem — so they can't reach the report until a tech promotes them.
 */

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // per image
const MAX_IMAGES = 10;
const MAX_DESC = 2000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const limited = await applyRateLimit(request, {
    prefix: "portal-evidence",
    key: token,
    windowMs: 10 * 60 * 1000,
    maxRequests: 20,
    failClosedOnUpstashError: true,
  });
  if (limited) return limited;

  const bot = await verifyBotId();
  if (!bot.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const account = await lookupPortalAccount(token);
  if (!account) {
    return NextResponse.json(
      { error: "invalid_or_expired_link" },
      { status: 404 },
    );
  }

  // Resolve the claim's inspection FROM THE TOKEN's client only.
  const inspection = await prisma.inspection.findFirst({
    where: { report: { clientId: account.clientId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, workspaceId: true, userId: true },
  });
  if (!inspection) {
    return NextResponse.json({ error: "no_claim" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 422 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const description = sanitizeString(b.description, MAX_DESC);
  const images = Array.isArray(b.images) ? b.images : [];

  if (images.length > MAX_IMAGES) {
    return NextResponse.json({ error: "too_many_images" }, { status: 413 });
  }
  if (images.length === 0 && !description) {
    return NextResponse.json({ error: "nothing_to_submit" }, { status: 422 });
  }

  const decoded = [];
  for (const img of images) {
    const d = decodeImageDataUrl(img, MAX_IMAGE_BYTES);
    if (!d) {
      return NextResponse.json({ error: "invalid_image" }, { status: 422 });
    }
    decoded.push(d);
  }

  const orgId = inspection.workspaceId ?? inspection.userId;
  const provider = new SupabaseStorageProvider();
  let submitted = 0;

  if (decoded.length === 0) {
    await prisma.clientEvidenceSubmission.create({
      data: { inspectionId: inspection.id, description: description || null },
    });
    submitted = 1;
  } else {
    for (let i = 0; i < decoded.length; i++) {
      const d = decoded[i];
      const fileName = `client-evidence-${i + 1}.${d.ext}`;
      const out = await provider.upload({
        buffer: d.buffer,
        filename: fileName,
        mimeType: d.mime,
        orgId,
        inspectionId: inspection.id,
      });
      await prisma.clientEvidenceSubmission.create({
        data: {
          inspectionId: inspection.id,
          description: i === 0 ? description || null : null,
          fileUrl: out.storagePath, // durable path; signed on staff review
          fileName,
          fileMimeType: d.mime,
          fileSizeBytes: out.sizeBytes,
        },
      });
      submitted++;
    }
  }

  return NextResponse.json({
    data: { submitted, status: "submitted_for_review" },
  });
}
