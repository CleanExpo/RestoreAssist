/**
 * GET /api/admin/deskilling-scorecard
 *
 * Returns the current 4-tier deskilling KPI snapshot and technician leaderboard.
 * Admin and tenant owner access only.
 *
 * RA-1135
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { getScorecardSnapshot, getTechnicianLeaderboard } from "@/lib/deskilling-scorecard/score";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const [snapshot, leaderboard] = await Promise.all([
    getScorecardSnapshot(),
    getTechnicianLeaderboard(),
  ]);

  return NextResponse.json({ snapshot, leaderboard });
}
