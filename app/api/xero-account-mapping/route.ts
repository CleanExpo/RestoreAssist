/**
 * RA-874: Xero Account Mapping — API
 *
 * GET  /api/xero-account-mapping
 *   Returns all XeroAccountCodeMapping rows for the current user's Xero integration.
 *   Response: { data: XeroAccountCodeMapping[] } or { error }
 *   Extra: `hasIntegration: boolean` — false when the user hasn't connected Xero yet.
 *
 * PUT  /api/xero-account-mapping
 *   Upsert a single mapping row. Validates the account code (3–4 digit numeric or Xero GUID).
 *   Body: { category: string | null, accountCode: string, taxType?: string, description?: string }
 *   - category = null creates/updates the "per-integration default" row.
 *   Response: { data: XeroAccountCodeMapping } or { error }
 *
 * DELETE /api/xero-account-mapping?category=LABOUR
 *   Deletes a mapping for the given category ("__default__" for null). Lets the UI
 *   "Reset to defaults" — the resolver then falls back to built-ins.
 *
 * Every mutation invalidates the resolver's in-process cache for the integration.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  clearAccountCodeCache,
  isValidXeroAccountCode,
} from "@/lib/integrations/xero/account-code-resolver";

const DEFAULT_SENTINEL = "__default__"; // used by the UI to target the null-category row

async function getActiveXeroIntegration(userId: string) {
  return prisma.integration.findFirst({
    where: { userId, provider: "XERO", status: "CONNECTED" },
    select: { id: true },
  });
}

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const integration = await getActiveXeroIntegration(session.user.id);
    if (!integration) {
      return NextResponse.json({ data: [], hasIntegration: false });
    }

    const mappings = await prisma.xeroAccountCodeMapping.findMany({
      where: { integrationId: integration.id },
      orderBy: { category: "asc" },
      take: 200,
    });

    return NextResponse.json({ data: mappings, hasIntegration: true });
  } catch (err) {
    console.error("[xero-account-mapping GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      category?: string | null;
      accountCode?: string;
      taxType?: string;
      description?: string | null;
    } | null;

    if (!body || typeof body.accountCode !== "string") {
      return NextResponse.json(
        { error: "accountCode is required" },
        { status: 400 },
      );
    }

    if (!isValidXeroAccountCode(body.accountCode)) {
      return NextResponse.json(
        {
          error:
            "Invalid account code format — must be 3–4 digits or a Xero GUID",
        },
        { status: 400 },
      );
    }

    const category =
      body.category === undefined ||
      body.category === null ||
      body.category === DEFAULT_SENTINEL
        ? null
        : String(body.category).trim();

    if (category !== null && category.length === 0) {
      return NextResponse.json(
        { error: "category cannot be empty (use null for default)" },
        { status: 400 },
      );
    }

    const integration = await getActiveXeroIntegration(session.user.id);
    if (!integration) {
      return NextResponse.json(
        { error: "No active Xero integration — connect Xero first" },
        { status: 409 },
      );
    }

    const data = {
      accountCode: body.accountCode.trim(),
      taxType:
        typeof body.taxType === "string" && body.taxType.trim()
          ? body.taxType.trim()
          : "OUTPUT",
      description:
        typeof body.description === "string"
          ? body.description.slice(0, 500)
          : null,
    };

    // Composite unique (integrationId, category) doesn't work with nullable
    // category in Prisma, so we check existence first and create/update manually.
    const existing = await prisma.xeroAccountCodeMapping.findFirst({
      where: { integrationId: integration.id, category },
      select: { id: true },
    });

    const mapping = existing
      ? await prisma.xeroAccountCodeMapping.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.xeroAccountCodeMapping.create({
          data: {
            integrationId: integration.id,
            category,
            ...data,
          },
        });

    clearAccountCodeCache(integration.id);

    return NextResponse.json({ data: mapping });
  } catch (err) {
    console.error("[xero-account-mapping PUT]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawCategory = searchParams.get("category");
    if (rawCategory === null) {
      return NextResponse.json(
        { error: "category query parameter required" },
        { status: 400 },
      );
    }

    const integration = await getActiveXeroIntegration(session.user.id);
    if (!integration) {
      return NextResponse.json(
        { error: "No active Xero integration" },
        { status: 409 },
      );
    }

    const category = rawCategory === DEFAULT_SENTINEL ? null : rawCategory;

    const deleted = await prisma.xeroAccountCodeMapping.deleteMany({
      where: {
        integrationId: integration.id,
        category,
      },
    });

    clearAccountCodeCache(integration.id);

    return NextResponse.json({ data: { deletedCount: deleted.count } });
  } catch (err) {
    console.error("[xero-account-mapping DELETE]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
