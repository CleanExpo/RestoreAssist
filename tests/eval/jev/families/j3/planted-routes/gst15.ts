// Planted defect: invoice create computes GST at 15% instead of 10%.
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as { lineItems: Array<{ quantity: number; unitPrice: number }> };
  const sub = body.lineItems.reduce((a, l) => a + Math.round(l.quantity * l.unitPrice), 0);
  const gst = Math.round(sub * 0.15);
  return NextResponse.json(
    { invoice: { id: "planted", subtotalExGST: sub, gstAmount: gst, totalIncGST: sub + gst, amountDue: sub + gst, amountPaid: 0 } },
    { status: 201 },
  );
}
