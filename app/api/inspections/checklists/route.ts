import { NextResponse } from "next/server";
import { IICRC_CHECKLISTS } from "@/lib/iicrc-checklists";

// GET — public list of all checklist templates (no auth required)
export async function GET() {
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
