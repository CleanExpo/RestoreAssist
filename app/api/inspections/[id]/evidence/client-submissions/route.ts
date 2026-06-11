import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { SupabaseStorageProvider } from "@/lib/storage/supabase-provider";

/**
 * List the client-portal evidence still awaiting staff review (client portal
 * Phase 2b-iii). Drives the staff "review client photos" panel so a technician
 * can SEE what the client sent before accepting it into the report via
 * POST /api/inspections/[id]/evidence/promote-client.
 *
 * Authed + tenancy-gated. Files are private originals (#45) — each is returned
 * with a short-lived signed view URL; signing failures degrade to a null URL
 * rather than failing the whole list.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }
    const { id } = await params;
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const pending = await prisma.clientEvidenceSubmission.findMany({
      where: { inspectionId: id, reviewedAt: null },
      orderBy: { submittedAt: "asc" },
    });

    const provider = new SupabaseStorageProvider();
    const submissions = await Promise.all(
      pending.map(async (s) => {
        let viewUrl: string | null = null;
        if (s.fileUrl) {
          try {
            viewUrl = await provider.getSignedUrl(s.fileUrl);
          } catch {
            viewUrl = null; // best-effort — don't fail the whole list
          }
        }
        return {
          id: s.id,
          description: s.description,
          fileName: s.fileName,
          fileMimeType: s.fileMimeType,
          fileSizeBytes: s.fileSizeBytes,
          submittedAt: s.submittedAt,
          viewUrl,
        };
      }),
    );

    return NextResponse.json({ data: { submissions } });
  } catch (e) {
    return fromException(request, e);
  }
}
