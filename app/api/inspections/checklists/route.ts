import { NextRequest, NextResponse } from "next/server";
import { IICRC_CHECKLISTS } from "@/lib/iicrc-checklists";
import { applyRateLimit } from "@/lib/rate-limiter";

// GET — public list of all checklist templates (no auth required)
export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 60,
    windowMs: 15 * 60 * 1000,
    prefix: "checklists-public",
  });
  if (rateLimited) return rateLimited;

  const list = IICRC_CHECKLISTS.map(
    ({ id, name, category, description, items }) => ({
      id,
      name,
      category,
      description,
      itemCount: items.length,
    }),
  );

  return NextResponse.json({ checklists: list });
}
