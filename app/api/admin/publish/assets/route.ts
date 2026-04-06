import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { execFile } from "child_process";
import path from "path";

const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/generate-store-assets.ts");

function triggerAssetGeneration(baseUrl?: string): void {
  const args = ["--loader=ts-node/esm", SCRIPT_PATH];
  if (baseUrl) {
    args.push("--url", baseUrl);
  }

  execFile("node", args, { detached: true }, (err) => {
    if (err) {
      console.error("Store asset generation error:", err.message);
    }
  });
}

/**
 * GET /api/admin/publish/assets
 * Triggers store asset generation in a non-blocking way.
 * Auth: ADMIN only.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  triggerAssetGeneration();

  return NextResponse.json({
    status: "started",
    message: "Store asset generation triggered",
  });
}

/**
 * POST /api/admin/publish/assets
 * Body: { baseUrl?: string }
 * Triggers store asset generation with optional base URL, non-blocking.
 * Auth: ADMIN only.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { baseUrl?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional — fall through with defaults
  }

  triggerAssetGeneration(body.baseUrl);

  return NextResponse.json({
    status: "started",
    message: "Store asset generation triggered",
  });
}
