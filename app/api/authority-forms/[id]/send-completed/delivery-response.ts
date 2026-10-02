import { NextResponse } from "next/server";

export function completedDeliveryResponse(sent: number, failed: number, total: number) {
  if (sent === 0) {
    return NextResponse.json(
      { success: false, state: "DELIVERY_FAILED_OR_UNRESOLVED", sent, failed, total },
      { status: 502 },
    );
  }
  if (failed > 0) {
    return NextResponse.json(
      { success: false, partial: true, state: "PARTIALLY_DELIVERED", sent, failed, total },
      // 5xx makes the outer request reservation retryable. Recipient-level
      // delivery identities replay confirmed sends and retry only known failures.
      { status: 503 },
    );
  }
  return NextResponse.json({ success: true, state: "DELIVERED", sent, failed, total });
}
