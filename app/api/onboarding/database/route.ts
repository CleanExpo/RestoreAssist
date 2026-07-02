import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { encrypt } from "@/lib/credential-vault";
import { validateConnectionString } from "@/lib/tenant/onboarding-helpers";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * POST /api/onboarding/database — cutover onboarding, gate G1.
 *
 * A workspace owner submits (or has provisioned) their own tenant DB connection
 * string. We validate it, encrypt it (AES-256-GCM via credential-vault — the raw
 * string never lands in the row or a log), store it, and mark the workspace
 * `provisioning`. The connectivity test + baseline migration + flip to `ready`
 * run in the provisioning worker (integration-scoped: needs the generated tenant
 * client + a reachable DB — the pilot proved that path on real Postgres), and
 * are gated on the pilot's real flagged-workspace run. First-claim stays gated by
 * `tenantDbStatus` until then (see lib/tenant/onboarding-helpers.canDeployFirstClaim).
 */
export async function POST(request: NextRequest) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  // Only the workspace owner may connect the database (G1 admin gate).
  const workspace = await prisma.workspace.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!workspace) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "No workspace found for this account",
      status: 404,
    });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid request body",
      status: 400,
    });
  }

  const connectionString =
    typeof body.connectionString === "string" ? body.connectionString : "";
  const check = validateConnectionString(connectionString);
  if (!check.ok) {
    return apiError(request, {
      code: "VALIDATION",
      message: check.error ?? "Invalid connection string",
      status: 400,
    });
  }

  try {
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        tenantDbConnectionEnc: encrypt(connectionString),
        tenantDbStatus: "provisioning",
      } as never,
    });
    return NextResponse.json(
      { data: { status: "provisioning" } },
      { status: 202 },
    );
  } catch (err) {
    return fromException(request, err, { stage: "database" });
  }
}
