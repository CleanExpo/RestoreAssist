/**
 * GET /api/synced/clients?source=xero|ascora
 *
 * Browse synced external clients without importing into native Client.
 * Xero → ExternalClient; Ascora → distinct HistoricalJob.customerName.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { listSyncedClients } from "@/lib/synced-data/list";
import {
  isExternalDataSource,
  type SyncedListResponse,
  type SyncedClientRow,
} from "@/lib/synced-data/types";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { searchParams } = new URL(request.url);
    const sourceParam = (searchParams.get("source") || "").toLowerCase();
    if (!isExternalDataSource(sourceParam)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "source must be xero or ascora",
        status: 400,
      });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    // Prefer pageSize; accept legacy `limit` alias.
    const rawSize =
      searchParams.get("pageSize") || searchParams.get("limit") || "20";
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(rawSize, 10) || 20),
    );
    const search = searchParams.get("search") || undefined;

    const result = await listSyncedClients({
      userId: session.user.id,
      source: sourceParam,
      page,
      limit: pageSize,
      search,
    });

    const body: SyncedListResponse<SyncedClientRow> = {
      source: sourceParam,
      connected: result.connected,
      items: result.items,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize) || 0,
      },
      message: result.message,
    };

    return NextResponse.json(body);
  } catch (error) {
    return fromException(request, error, { stage: "synced-clients-list" });
  }
}
