import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * GET / PATCH / DELETE /api/scopes/[id]
 *
 * Single-scope CRUD. Closes RA-1273. Scopes are first-class resources
 * (1:1 with Report, feeding Estimate + line items). UI previously had
 * to round-trip the full parent report payload to edit a scope, which
 * rewrote unrelated fields. These three verbs let the scope editor
 * persist partial changes without touching the report.
 *
 * Ownership model: Scope has no direct userId — we enforce ownership
 * via the parent Report's userId.
 */

type LoadResult =
  | { kind: "ok"; scope: Awaited<ReturnType<typeof prisma.scope.findUnique>> }
  | { kind: "not_found" }
  | { kind: "forbidden" };

async function loadScopeForUser(
  id: string,
  userId: string,
): Promise<LoadResult> {
  const scope = await prisma.scope.findUnique({
    where: { id },
    include: { report: { select: { userId: true, id: true } } },
  });
  if (!scope) return { kind: "not_found" };
  if (scope.report.userId !== userId) return { kind: "forbidden" };
  return { kind: "ok", scope };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(_request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const { id } = await params;

    const result = await loadScopeForUser(id, session.user.id);
    if (result.kind !== "ok") {
      return apiError(_request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });
    }

    return NextResponse.json({ scope: result.scope });
  } catch (error) {
    return fromException(_request, error, { stage: "get" });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const { id } = await params;

    const result = await loadScopeForUser(id, session.user.id);
    if (result.kind !== "ok") {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });
    }

    const rawPatch = await request.json().catch(() => ({}));
    const body: Record<string, unknown> =
      rawPatch && typeof rawPatch === "object" && !Array.isArray(rawPatch)
        ? rawPatch
        : {};

    // Whitelist editable fields — never let client patch reportId or id.
    const editable = [
      "scopeType",
      "siteVariables",
      "labourParameters",
      "equipmentParameters",
      "chemicalApplication",
      "timeCalculations",
      "summary",
      "complianceNotes",
      "assumptions",
    ] as const;

    const data: Record<string, unknown> = {};
    for (const key of editable) {
      if (key in body) data[key] = body[key];
    }

    if (Object.keys(data).length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No editable fields provided",
        status: 400,
      });
    }

    const updated = await prisma.scope.update({
      where: { id, report: { userId: session.user.id } },
      data,
    });

    return NextResponse.json({ scope: updated });
  } catch (error) {
    return fromException(request, error, { stage: "patch" });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(_request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }
    const { id } = await params;

    const result = await loadScopeForUser(id, session.user.id);
    if (result.kind !== "ok") {
      return apiError(_request, {
        code: "NOT_FOUND",
        message: "Not found",
        status: 404,
      });
    }

    await prisma.scope.delete({
      where: { id, report: { userId: session.user.id } },
    });
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return fromException(_request, error, { stage: "delete" });
  }
}
