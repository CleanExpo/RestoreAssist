// Planted defect: a submit-time classifier that ignores the water category and always stores Category 1.
// The class is computed honestly so the only defect is the ignored category.
import { NextResponse } from "next/server";
import { s500Expected } from "../oracles";
import type { SiteArea } from "../variants";

export async function POST(req: Request) {
  const body = (await req.json()) as { areas: SiteArea[] };
  return NextResponse.json({ classification: { category: "1", class: s500Expected(body.areas).cls, reviewedBy: null } });
}
