// Planted defect: invoice generated from a claim's estimate lines with GST at 15% instead of 10%.
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as { lines: Array<{ description: string; subtotal: number }> };
  const lineItems = body.lines.map((l) => {
    const subtotal = Math.round(l.subtotal * 100);
    const gstAmount = Math.round(subtotal * 0.15);
    return { description: l.description, subtotal, gstRate: 15, gstAmount, total: subtotal + gstAmount };
  });
  const sub = lineItems.reduce((a, l) => a + l.subtotal, 0);
  const gst = Math.round(sub * 0.15);
  return NextResponse.json(
    { invoice: { id: "planted", lineItems, subtotalExGST: sub, gstAmount: gst, totalIncGST: sub + gst, amountDue: sub + gst, adjustmentAmount: 0 } },
    { status: 201 },
  );
}
