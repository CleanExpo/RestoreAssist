import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { spawn } from "child_process";
import { resolve } from "path";

const SCRIPT_PATH = resolve(process.cwd(), "scripts/generate-store-assets.ts");

function triggerAssetGeneration(baseUrl?: string): void {
  const args = [SCRIPT_PATH];
  if (baseUrl) {
    args.push("--url", baseUrl);
  }

  // Use npx tsx to run TypeScript scripts without --loader flag
  // (avoids Turbopack static analysis issue with dynamic loader strings)
  const child = spawn("npx", ["tsx", ...args], {
    detached: true,
    stdio: "ignore",
  });

  child.on("error", (err) => {
    console.error("Store asset generation error:", err.message);
  });

  // Detach so the parent process doesn't wait for the child
  child.unref();
}

/**
 * GET /api/admin/publish/assets
 * Triggers store asset generation in a non-blocking way.
 * Auth: ADMIN only.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

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
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

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
