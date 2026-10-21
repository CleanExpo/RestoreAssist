/**
 * J6 step oracles. Real steps and planted controls call these same functions,
 * so a control that catches its planted defect proves the oracle can fail.
 */
import type { SiteArea } from "./variants";

export interface Check {
  ok: boolean;
  detail: string;
}
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ── Classification ──────────────────────────────────────────────────────────
// Expected IICRC S500 outcome recomputed from the inputs J6 sent, written from
// the standard's definitions as the product documents them (header of
// lib/nir-classification-engine.ts), not by calling the engine:
//   Category: sewage/black 3, grey 2, clean 1; clean water standing > 48 h is
//   treated as Category 2 (S500 §7.1 note).
//   Class: specialty dense material (concrete, hardwood, timber, brick, stone,
//   plaster) with elevated moisture (> 15 %) -> 4; > 500 sq ft affected with
//   avg > 20 % -> 3; > 100 sq ft or avg > 15 % -> 2; otherwise 1.
//   The job takes the worst category and the worst class over its areas.

const SQFT_PER_SQM = 10.7639;
const DENSE = ["concrete", "hardwood", "timber", "brick", "stone", "plaster"];

export function s500Expected(areas: SiteArea[]): { category: string; cls: string; why: string } {
  let cat = 1;
  let cls = 1;
  const why: string[] = [];
  for (const a of areas) {
    const src = a.waterSource.toLowerCase();
    let c = /sewage|black/.test(src) ? 3 : /grey|gray/.test(src) ? 2 : /clean/.test(src) ? 1 : 2;
    if (c === 1 && a.timeSinceLoss > 48) c = 2;
    const sqft = a.areaSqm * SQFT_PER_SQM;
    const dense = DENSE.some((m) => a.surfaceType.toLowerCase().includes(m));
    const k = dense && a.moisture > 15 ? 4 : sqft > 500 && a.moisture > 20 ? 3 : sqft > 100 || a.moisture > 15 ? 2 : 1;
    why.push(`${a.room}: cat ${c} (${a.timeSinceLoss} h), class ${k} (${a.areaSqm} m2, ${a.moisture}% ${a.surfaceType})`);
    cat = Math.max(cat, c);
    cls = Math.max(cls, k);
  }
  return { category: String(cat), cls: String(cls), why: why.join("; ") };
}

/** The classification stored at submit must be the automatic one and match the S500 expectation. */
export function classificationOracle(stored: Json | null | undefined, areas: SiteArea[]): Check {
  const want = s500Expected(areas);
  if (!stored) return { ok: false, detail: `no classification stored; want ${want.category}/${want.cls}` };
  const got = `${stored.category}/${stored.class}`;
  const d = `stored ${got}${stored.reviewedBy ? " (manual)" : " (automatic)"}, want ${want.category}/${want.cls} from ${want.why}`;
  if (String(stored.category) !== want.category || String(stored.class) !== want.cls) return { ok: false, detail: d };
  if (stored.reviewedBy) return { ok: false, detail: `${d}: a manual choice, not the submit-time classification` };
  return { ok: true, detail: d };
}

// ── Submit ──────────────────────────────────────────────────────────────────
const POST_SUBMIT = new Set(["SUBMITTED", "PROCESSING", "CLASSIFIED", "SCOPED", "ESTIMATED"]);

/**
 * Submit answered 200 with SUBMITTED, the stored inspection left DRAFT for a
 * post-submit state with submittedAt set, and it carried at least one photo.
 */
export function submitOracle(status: number | null, body: Json | null, persisted: Json | null, photoCount: number): Check {
  const d = `answered ${status} ${body?.status ?? body?.error ?? ""}, stored ${persisted?.status ?? "?"} submittedAt ${persisted?.submittedAt ? "set" : "unset"}, photos ${photoCount}`;
  if (status !== 200 || body?.status !== "SUBMITTED") return { ok: false, detail: d };
  if (!persisted || !POST_SUBMIT.has(String(persisted.status)) || !persisted.submittedAt) return { ok: false, detail: d };
  if (photoCount < 1) return { ok: false, detail: `${d}: submitted with no photo` };
  return { ok: true, detail: d };
}

// ── Invoice from the claim ──────────────────────────────────────────────────
/**
 * The invoice generated from the claim's approved estimate: one line per
 * estimate line at that line's ex-GST cents (+/- 1 c for dollar rounding),
 * subtotal = sum of its own lines, GST = 10 % (rounded per invoice or summed
 * per line), total = subtotal + GST, amount due = total.
 */
export function invoiceOracle(inv: Json | null | undefined, expected: Array<{ description: string; subtotal: number }>): Check {
  if (!inv) return { ok: false, detail: "no invoice" };
  const lines: Json[] = inv.lineItems ?? [];
  const sum = lines.reduce((a, l) => a + Number(l.subtotal ?? NaN), 0);
  const sub = inv.subtotalExGST;
  const gst = inv.gstAmount;
  const got = `lines ${lines.length}/${expected.length}, sum ${sum}, sub ${sub}, gst ${gst}, total ${inv.totalIncGST}, due ${inv.amountDue}, adj ${inv.adjustmentAmount ?? 0}`;
  if (lines.length !== expected.length) return { ok: false, detail: `line count: ${got}` };
  for (let k = 0; k < expected.length; k++) {
    const want = Math.round(expected[k].subtotal * 100);
    if (Math.abs(Number(lines[k].subtotal) - want) > 1) return { ok: false, detail: `line ${k} ${lines[k].subtotal} c vs estimate ${want} c: ${got}` };
  }
  if (sum !== sub) return { ok: false, detail: `subtotal != sum of lines: ${got}` };
  const gstInvoice = Math.round(sub * 0.1);
  const gstLines = lines.reduce((a, l) => a + Math.round(Number(l.subtotal) * 0.1), 0);
  if (gst !== gstInvoice && gst !== gstLines) return { ok: false, detail: `GST ${gst} is not 10% of ${sub} (want ${gstInvoice} or ${gstLines}): ${got}` };
  if (inv.totalIncGST !== sub + gst) return { ok: false, detail: `total != subtotal + GST: ${got}` };
  if (inv.amountDue !== inv.totalIncGST) return { ok: false, detail: `amount due != total: ${got}` };
  return { ok: true, detail: got };
}

// ── Report photos ───────────────────────────────────────────────────────────
/**
 * The PDF must embed the uploaded photo: an image XObject whose pixel size is
 * the photo's (J6 photos are an odd 13 x 11 so a logo or icon cannot match).
 */
export function pdfImageCount(text: string, width: number, height: number): number {
  let n = 0;
  for (const chunk of text.split("endobj")) {
    if (!/\/Subtype\s*\/Image\b/.test(chunk)) continue;
    if (new RegExp(`/Width\\s+${width}\\b`).test(chunk) && new RegExp(`/Height\\s+${height}\\b`).test(chunk)) n++;
  }
  return n;
}

export function reportPhotosOracle(status: number | null, text: string, width: number, height: number, want = 1): Check {
  if (status !== 200) return { ok: false, detail: `status ${status}: ${text.slice(0, 120)}` };
  if (!text.startsWith("%PDF")) return { ok: false, detail: `not a PDF: ${text.slice(0, 60)}` };
  const total = (text.match(/\/Subtype\s*\/Image\b/g) ?? []).length;
  const n = pdfImageCount(text, width, height);
  const missing = /could not be included|could not include/i.test(text) ? "; PDF notes photos it could not include" : "";
  const d = `${n} embedded ${width}x${height} photo image(s), ${total} image XObject(s) in all, ${text.length} chars${missing}`;
  return { ok: n >= want, detail: d };
}
