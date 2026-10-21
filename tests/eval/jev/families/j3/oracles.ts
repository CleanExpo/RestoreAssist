/**
 * J3 step oracles. The real steps and the planted controls call these same
 * functions, so a control that catches its planted defect proves the oracle
 * the real step relies on can fail.
 */
import type { InvoiceLine, Room } from "./variants";

export interface Check {
  ok: boolean;
  detail: string;
}

type Inv = { subtotalExGST?: number; gstAmount?: number; totalIncGST?: number; amountDue?: number; amountPaid?: number };

/** Round half up to whole cents, robust to float noise in qty x price. */
export function cents(x: number): number {
  return Math.floor(x + 0.5 + 1e-9);
}

/**
 * total = subtotal + 10% GST rounded to cents, amountDue = total - paid.
 * GST may be rounded per invoice or summed per line (both ATO-acceptable);
 * anything else, including a 15% rate, fails.
 */
export function gstOracle(inv: Inv | undefined | null, lines: InvoiceLine[], paid = 0): Check {
  if (!inv) return { ok: false, detail: "no invoice in response" };
  const lineSubs = lines.map((l) => cents(l.quantity * l.unitPrice));
  const sub = lineSubs.reduce((a, b) => a + b, 0);
  const gstInvoice = cents(sub * 0.1);
  const gstLines = lineSubs.reduce((a, s) => a + cents(s * 0.1), 0);
  const got = `sub=${inv.subtotalExGST} gst=${inv.gstAmount} total=${inv.totalIncGST} due=${inv.amountDue}`;
  if (inv.subtotalExGST !== sub) return { ok: false, detail: `subtotal ${inv.subtotalExGST} != ${sub} (${got})` };
  if (inv.gstAmount !== gstInvoice && inv.gstAmount !== gstLines) return { ok: false, detail: `GST ${inv.gstAmount} is not 10% of ${sub} (want ${gstInvoice} or ${gstLines}) (${got})` };
  if (inv.totalIncGST !== sub + (inv.gstAmount ?? NaN)) return { ok: false, detail: `total != subtotal + GST (${got})` };
  const total = inv.totalIncGST as number;
  if (inv.amountDue !== total - paid) return { ok: false, detail: `amountDue ${inv.amountDue} != total ${total} - paid ${paid}` };
  return { ok: true, detail: got };
}

type Est = { estimate?: { lineItems?: Array<{ category?: string; areaM2?: number; quantity?: number }>; totalRoomAreaM2?: number } };

/** Every drawn room yields a room line and the summed room area matches the plan. */
export function sketchEstimateOracle(body: Est | null, rooms: Room[]): Check {
  const est = body?.estimate;
  if (!est || !Array.isArray(est.lineItems)) return { ok: false, detail: "no estimate.lineItems in response" };
  const roomLines = est.lineItems.filter((l) => l.category === "room");
  const want = rooms.reduce((a, r) => a + r.lengthM * r.widthM, 0);
  const got = Number(est.totalRoomAreaM2 ?? 0);
  const d = `room lines ${roomLines.length}/${rooms.length}, area ${got.toFixed(2)} m2 vs plan ${want.toFixed(2)} m2, all lines ${est.lineItems.length}`;
  if (roomLines.length < rooms.length) return { ok: false, detail: d };
  if (Math.abs(got - want) > 0.05 * rooms.length + 0.01) return { ok: false, detail: d };
  return { ok: true, detail: d };
}

/** A list response shown to an outsider must carry none of the forbidden ids or the firm A mark. */
export function tenantListOracle(text: string, forbidden: string[], markA: string): Check {
  const hit = forbidden.filter((id) => text.includes(id));
  if (hit.length) return { ok: false, detail: `outsider list contains firm A record(s) ${hit.join(",")}` };
  if (text.includes(markA)) return { ok: false, detail: "outsider list contains firm A marked text" };
  return { ok: true, detail: "no firm A record in outsider list" };
}

/** A webhook without a valid signature must be refused with a 4xx. */
export function webhookRejectOracle(status: number | null): Check {
  if (status !== null && status >= 400 && status < 500) return { ok: true, detail: `rejected ${status}` };
  return { ok: false, detail: `unsigned or wrongly signed event answered ${status}` };
}
