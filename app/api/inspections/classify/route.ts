import { NextResponse } from "next/server";
import { ruleBasedClassify } from "@/lib/ai/auto-classify";

// POST /api/inspections/classify
// Body: { description, notes?, averageMoistureReading?, location?, tenantId? }
// Returns: ClassificationResult
export async function POST(req: Request) {
  const body = await req.json();
  const result = ruleBasedClassify({
    description: body.description ?? "",
    notes: body.notes,
    averageMoistureReading: body.averageMoistureReading,
    location: body.location,
  });
  return NextResponse.json(result);
}
