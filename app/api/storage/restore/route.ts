import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RestoreMode } from "@prisma/client";
import {
  computeRestorePlan,
  enqueueRestorePlan,
  type RestoreScope,
} from "@/lib/restore/plan";
import { getRestoreQueueStats } from "@/lib/queue/storage-restore";
import { apiError } from "@/lib/api-errors";

export async function requireOwner(): Promise<
  { orgId: string; userId: string } | { error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      error: apiError(undefined, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      }),
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });
  if (!user?.organizationId) {
    return {
      error: apiError(undefined, {
        code: "NOT_FOUND",
        message: "No organization",
        status: 404,
      }),
    };
  }
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { ownerId: true },
  });
  if (!org || org.ownerId !== session.user.id) {
    return {
      error: apiError(undefined, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      }),
    };
  }
  return { orgId: user.organizationId, userId: session.user.id };
}

function parseScope(
  params: URLSearchParams | Record<string, unknown>,
): RestoreScope {
  const get = (k: string) =>
    params instanceof URLSearchParams
      ? params.get(k)
      : (params[k] as string | undefined);
  const inspectionId = get("inspectionId");
  if (get("scope") === "inspection" && inspectionId) {
    return { type: "inspection", inspectionId };
  }
  return { type: "org" };
}

export async function GET(request: NextRequest) {
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scope = parseScope(searchParams);
  const [plan, stats, jobs] = await Promise.all([
    computeRestorePlan(auth.orgId, scope),
    getRestoreQueueStats(auth.orgId),
    prisma.storageRestoreJob.findMany({
      where: { orgId: auth.orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        status: true,
        filename: true,
        mode: true,
        attempts: true,
        lastError: true,
        completedAt: true,
        createdAt: true,
      },
    }),
  ]);
  return NextResponse.json({ data: { ...plan, stats, jobs } });
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const scope = parseScope(body);
  const mode = body.mode === "FORCE" ? RestoreMode.FORCE : RestoreMode.MISSING;
  const result = await enqueueRestorePlan(auth.orgId, scope, mode, auth.userId);
  return NextResponse.json({ data: result });
}
