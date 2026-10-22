/**
 * J4 properties. Each property names one product function (impl), a seeded
 * input sample, and a check that returns null when the product agrees with
 * the independent oracle, or a one-line mismatch otherwise. The check takes
 * the implementation as an argument so the planted controls run the SAME
 * check against a deliberately wrong implementation.
 */
import fc from "fast-check";
import Decimal from "decimal.js";
import type { JevArea } from "../../runner/record";
import { computeGstCents } from "@/lib/gst-rules";
import { calculateInvoiceTotals, dollarsToCents, lineAmountsCents } from "@/lib/invoices/calc";
import { lineTotal } from "@/lib/estimate-lines";
import { applyMinimumCharge, MINIMUM_CHARGE_EX_GST } from "@/lib/quotes/quote-calc";
import { shoelaceAreaPx2, px2ToM2 } from "@/lib/sketch/geometry-utils";
import { roomAreaM2 } from "@/lib/sketch/tool-objects";
import { shoelaceArea } from "@/lib/sketch/extract-rooms";
import { resolveRoomAreaM2, resolveRoomPerimeterM, resolveWallAreaM2 } from "@/lib/sketch/room-area-from-geometry";
import { deriveAreaColumns, resolveAreaSqm, sqftToSqm, sqmToSqft } from "@/lib/units";
import { isValidAbn, normaliseAbn } from "@/lib/abn/checksum";
import { isValidABN, sanitizeString } from "@/lib/sanitize";
import { formatABN } from "@/lib/integrations/xero";
import { deriveIicrClass, IICRC_CLASSES } from "@/lib/sketch/iicrc-utils";
import { getMoistureStatus, IICRC_DRY_STANDARDS } from "@/lib/iicrc-dry-standards";
import { extractWaterCategory } from "@/lib/reports/extract-report-data";
import { calculateAirMoversRequired, calculateAFDUnitsRequired } from "@/lib/psychrometric-calculations";
import { idealAirMovers, idealDehumidifiers, planDrying } from "@/lib/restoration/equipment-planner";
import { recommendEquipment } from "@/lib/sketch-estimate-extractor";
import { formatCurrencyCents, formatDate } from "@/lib/formatters";
import { formatMoney } from "@/lib/locale/format";
import { estimateCosts, type CompanyPricingRates } from "@/lib/nir-cost-estimation";
import { buildEstimateLines } from "@/lib/estimate-lines";
import { NRPG_RATE_RANGES } from "@/lib/nrpg-rate-ranges";
import {
  abnOracle,
  auDateOracle,
  audOracle,
  close,
  gstCentsOracle,
  halfUpDiv,
  iicrcClassOracle,
  lShape,
  rect,
  WATER_INDICATORS,
  waterCategoryOracle,
} from "./oracles";

export type Check<I, F> = (input: I, impl: F) => string | null | Promise<string | null>;

export interface Prop<I = any, F = any> {
  fn: string;
  area: JevArea;
  seed: number;
  inputs: () => I[];
  impl: F;
  check: Check<I, F>;
  /** Short printable form of an input for the FAIL detail. */
  show?: (input: I) => string;
}

const sample = <T>(arb: fc.Arbitrary<T>, seed: number, n: number): T[] => fc.sample(arb, { seed, numRuns: n });
const j = (x: unknown) => {
  const s = JSON.stringify(x, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v));
  return s && s.length > 400 ? `${s.slice(0, 400)}…` : String(s);
};

// ── payments ────────────────────────────────────────────────────────────

const centsArb = fc.oneof(
  fc.integer({ min: 0, max: 1_000_000_000 }),
  // Values ending in 5 sit exactly on a half-cent GST boundary at 10%.
  fc.integer({ min: 0, max: 99_999_999 }).map((k) => k * 10 + 5),
  fc.integer({ min: 0, max: 10_000 }),
);

const gstAU: Prop<number, typeof computeGstCents> = {
  fn: "computeGstCents.AU",
  area: "payments",
  seed: 4101,
  inputs: () => sample(centsArb, 4101, 600),
  impl: computeGstCents,
  check: (s, f) => {
    const got = f(s, "AU");
    const want = gstCentsOracle(s, 10);
    return got === want ? null : `subtotal ${s}c: got GST ${got}c, ATO half-up 10% is ${want}c`;
  },
};

const gstNZ: Prop<number, typeof computeGstCents> = {
  fn: "computeGstCents.NZ",
  area: "payments",
  seed: 4102,
  inputs: () => sample(centsArb, 4102, 400),
  impl: computeGstCents,
  check: (s, f) => {
    const got = f(s, "NZ");
    const want = gstCentsOracle(s, 15);
    return got === want ? null : `subtotal ${s}c: got GST ${got}c, half-up 15% is ${want}c`;
  },
};

type LineIn = { qi: number; p: number; rate: 0 | 10 | 15 };
const lineArb: fc.Arbitrary<LineIn> = fc.record({
  qi: fc.oneof(fc.integer({ min: 0, max: 500_000 }), fc.integer({ min: 1, max: 100 }).map((k) => k * 1000)),
  p: fc.integer({ min: 0, max: 10_000_000 }),
  rate: fc.constantFrom(0 as const, 10 as const, 15 as const),
});
function lineOracle(l: LineIn) {
  const sub = Number(halfUpDiv(BigInt(l.qi) * BigInt(l.p), 1000n));
  const gst = gstCentsOracle(sub, l.rate);
  return { subtotal: sub, gstAmount: gst, total: sub + gst };
}

const lineAmounts: Prop<LineIn, typeof lineAmountsCents> = {
  fn: "lineAmountsCents",
  area: "payments",
  seed: 4103,
  inputs: () => sample(lineArb, 4103, 500),
  impl: lineAmountsCents,
  check: (l, f) => {
    const got = f(l.qi / 1000, l.p, l.rate);
    const want = lineOracle(l);
    return got.subtotal === want.subtotal && got.gstAmount === want.gstAmount && got.total === want.total
      ? null
      : `qty ${l.qi / 1000} x ${l.p}c @${l.rate}%: got ${j(got)}, want ${j(want)}`;
  },
};

type InvIn = { lines: Array<LineIn & { useDefault: boolean }>; def: 10 | 15; pct?: number; amtFrac?: number; ship?: number };
const invLines = fc.array(
  fc.record({
    qi: fc.integer({ min: 0, max: 200_000 }),
    p: fc.integer({ min: 0, max: 2_000_000 }),
    rate: fc.constantFrom(0 as const, 10 as const, 15 as const),
    useDefault: fc.boolean(),
  }),
  { minLength: 1, maxLength: 8 },
);
const defArb = fc.constantFrom(10 as const, 15 as const);

function invBase(x: InvIn) {
  let sub = 0;
  let gst = 0;
  for (const l of x.lines) {
    const o = lineOracle({ ...l, rate: l.useDefault ? x.def : l.rate });
    sub += o.subtotal;
    gst += o.gstAmount;
  }
  return { sub, gst };
}
function invInput(x: InvIn, extra: Record<string, number> = {}) {
  return {
    lineItems: x.lines.map((l) => ({ quantity: l.qi / 1000, unitPrice: l.p, gstRate: l.useDefault ? null : l.rate })),
    defaultGstRatePercent: x.def,
    ...extra,
  };
}
function totalsShape(got: { subtotalExGST: number; gstAmount: number; totalIncGST: number }): string | null {
  for (const [k, v] of Object.entries(got)) {
    if (!Number.isInteger(v)) return `${k} is not integer cents (${v})`;
    if (v < 0) return `${k} is negative (${v})`;
  }
  if (got.totalIncGST !== got.subtotalExGST + got.gstAmount) return `total ${got.totalIncGST} != subtotal ${got.subtotalExGST} + gst ${got.gstAmount}`;
  return null;
}

const invPlain: Prop<InvIn, typeof calculateInvoiceTotals> = {
  fn: "calculateInvoiceTotals.plain",
  area: "payments",
  seed: 4104,
  inputs: () => sample(fc.record({ lines: invLines, def: defArb }), 4104, 400),
  impl: calculateInvoiceTotals,
  check: (x, f) => {
    const got = f(invInput(x));
    const shape = totalsShape(got);
    if (shape) return shape;
    const { sub, gst } = invBase(x);
    return got.subtotalExGST === sub && got.gstAmount === gst ? null : `got ${j(got)}, want subtotal ${sub} gst ${gst} (sum of lines)`;
  },
  show: (x) => j(invInput(x)),
};

const invPct: Prop<InvIn, typeof calculateInvoiceTotals> = {
  fn: "calculateInvoiceTotals.discountPct",
  area: "payments",
  seed: 4105,
  inputs: () => sample(fc.record({ lines: invLines, def: defArb, pct: fc.integer({ min: 1, max: 100 }) }), 4105, 300),
  impl: calculateInvoiceTotals,
  check: (x, f) => {
    const got = f(invInput(x, { discountPercentage: x.pct! }));
    const shape = totalsShape(got);
    if (shape) return shape;
    const { sub, gst } = invBase(x);
    const discount = Number(halfUpDiv(BigInt(sub) * BigInt(x.pct!), 100n));
    const wantSub = sub - discount;
    const wantGst = sub > 0 ? Number(halfUpDiv(BigInt(gst) * BigInt(wantSub), BigInt(sub))) : 0;
    if (x.pct === 100 && (got.subtotalExGST !== 0 || got.gstAmount !== 0)) return `100% discount left ${j(got)}`;
    return got.subtotalExGST === wantSub && got.gstAmount === wantGst ? null : `got ${j(got)}, want subtotal ${wantSub} gst ${wantGst}`;
  },
  show: (x) => j(invInput(x, { discountPercentage: x.pct! })),
};

const invAmt: Prop<InvIn, typeof calculateInvoiceTotals> = {
  fn: "calculateInvoiceTotals.discountAmount",
  area: "payments",
  seed: 4106,
  inputs: () => sample(fc.record({ lines: invLines, def: defArb, amtFrac: fc.double({ min: 0, max: 1, noNaN: true }) }), 4106, 300),
  impl: calculateInvoiceTotals,
  check: (x, f) => {
    const { sub, gst } = invBase(x);
    const amt = Math.floor(sub * x.amtFrac!);
    const got = f(invInput(x, { discountAmount: amt }));
    const shape = totalsShape(got);
    if (shape) return shape;
    const wantSub = sub - amt;
    const wantGst = amt === 0 ? gst : sub > 0 ? Number(halfUpDiv(BigInt(gst) * BigInt(wantSub), BigInt(sub))) : 0;
    return got.subtotalExGST === wantSub && got.gstAmount === wantGst ? null : `discount ${amt}c: got ${j(got)}, want subtotal ${wantSub} gst ${wantGst}`;
  },
  show: (x) => j({ ...invInput(x), amtFrac: x.amtFrac }),
};

const invShip: Prop<InvIn, typeof calculateInvoiceTotals> = {
  fn: "calculateInvoiceTotals.shipping",
  area: "payments",
  seed: 4107,
  inputs: () => sample(fc.record({ lines: invLines, def: defArb, ship: fc.integer({ min: 1, max: 500_000 }) }), 4107, 300),
  impl: calculateInvoiceTotals,
  check: (x, f) => {
    const got = f(invInput(x, { shippingAmount: x.ship! }));
    const shape = totalsShape(got);
    if (shape) return shape;
    const { sub, gst } = invBase(x);
    const wantSub = sub + x.ship!;
    const wantGst = gst + gstCentsOracle(x.ship!, x.def);
    return got.subtotalExGST === wantSub && got.gstAmount === wantGst ? null : `shipping ${x.ship}c: got ${j(got)}, want subtotal ${wantSub} gst ${wantGst}`;
  },
  show: (x) => j(invInput(x, { shippingAmount: x.ship! })),
};

const d2c: Prop<number, typeof dollarsToCents> = {
  fn: "dollarsToCents",
  area: "payments",
  seed: 4108,
  inputs: () => sample(fc.oneof(fc.integer({ min: 0, max: 100_000_000_000 }), fc.integer({ min: 0, max: 100_000 })), 4108, 500),
  impl: dollarsToCents,
  check: (k, f) => {
    const got = f(k / 100);
    return got === k ? null : `dollars ${k / 100}: got ${got}c, want ${k}c`;
  },
};

const lineTot: Prop<{ a: number; b: number }, typeof lineTotal> = {
  fn: "lineTotal",
  area: "payments",
  seed: 4109,
  inputs: () => sample(fc.record({ a: fc.integer({ min: 0, max: 50_000 }), b: fc.integer({ min: 0, max: 500_000 }) }), 4109, 400),
  impl: lineTotal,
  check: ({ a, b }, f) => {
    const got = f(a / 100, b / 100);
    const want = Number(halfUpDiv(BigInt(a) * BigInt(b), 100n)) / 100;
    return got === want ? null : `qty ${a / 100} x rate ${b / 100}: got ${got}, want ${want}`;
  },
};

const minCharge: Prop<number, typeof applyMinimumCharge> = {
  fn: "applyMinimumCharge",
  area: "payments",
  seed: 4110,
  inputs: () =>
    sample(
      fc.oneof(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 274_000, max: 276_000 }), fc.constant(MINIMUM_CHARGE_EX_GST * 100)),
      4110,
      300,
    ),
  impl: applyMinimumCharge,
  check: (cents, f) => {
    const got = f(cents / 100);
    const minC = MINIMUM_CHARGE_EX_GST * 100;
    const wantApplied = cents < minC;
    const want = (wantApplied ? minC : cents) / 100;
    if (got.subtotalExGST < MINIMUM_CHARGE_EX_GST) return `subtotal ${got.subtotalExGST} below the minimum ${MINIMUM_CHARGE_EX_GST}`;
    return got.subtotalExGST === want && got.minimumApplied === wantApplied ? null : `in ${cents / 100}: got ${j(got)}, want ${want} applied=${wantApplied}`;
  },
};

const NRPG_MID = Object.fromEntries(Object.entries(NRPG_RATE_RANGES).map(([k, r]) => [k, ((r as { min: number; max: number }).min + (r as { min: number; max: number }).max) / 2])) as unknown as CompanyPricingRates;
const estimate: Prop<{ q: number; r: number }, typeof estimateCosts> = {
  fn: "estimateCosts.lineTotal",
  area: "domain",
  seed: 4111,
  inputs: () => sample(fc.record({ q: fc.integer({ min: 10, max: 50_000 }), r: fc.integer({ min: 1, max: 500_000 }) }), 4111, 200),
  impl: estimateCosts,
  check: async ({ q, r }, f) => {
    const est = await f(
      [{ itemType: "install_dehumidification", description: "Dehumidification", quantity: q / 100 }] as never,
      null,
      { ...NRPG_MID, dehumidifierLGRDailyRate: r / 100 },
      null,
    );
    const lines = buildEstimateLines(est as never);
    const priced = lines.filter((l) => !l.description.startsWith("Contingency"));
    const want = Number(halfUpDiv(BigInt(q) * BigInt(r), 100n)) / 100;
    if (priced.length !== 1) return `expected 1 priced line, got ${priced.length}`;
    if (priced[0].total !== want) return `qty ${q / 100} x rate ${r / 100}: line total ${priced[0].total}, want ${want}`;
    const sum = lines.reduce((s, l) => s.plus(l.total), new Decimal(0)).toNumber();
    return sum === (est as { total: number }).total ? null : `sum of lines ${sum} != estimate total ${(est as { total: number }).total}`;
  },
};

// ── floorplans ──────────────────────────────────────────────────────────

const ppmArb = fc.constantFrom(100, 50, 37.5, 200, 64, 1);
type RectIn = { x: number; y: number; w: number; h: number; ppm: number };
const rectArb: fc.Arbitrary<RectIn> = fc.record({
  x: fc.integer({ min: -5000, max: 5000 }),
  y: fc.integer({ min: -5000, max: 5000 }),
  w: fc.integer({ min: 1, max: 5000 }),
  h: fc.integer({ min: 1, max: 5000 }),
  ppm: ppmArb,
});

const roomRect: Prop<RectIn, typeof roomAreaM2> = {
  fn: "roomAreaM2.rect",
  area: "floorplans",
  seed: 4201,
  inputs: () => sample(rectArb, 4201, 400),
  impl: roomAreaM2,
  check: (r, f) => {
    const got = f(rect(r.x, r.y, r.w, r.h), r.ppm);
    const want = (r.w * r.h) / (r.ppm * r.ppm);
    return close(got, want) ? null : `${r.w}x${r.h}px @${r.ppm}px/m: got ${got} m2, want ${want}`;
  },
};

type LIn = RectIn & { cw: number; ch: number };
const lArb: fc.Arbitrary<LIn> = rectArb.chain((r) =>
  fc.record({ cw: fc.integer({ min: 1, max: Math.max(1, r.w - 1) }), ch: fc.integer({ min: 1, max: Math.max(1, r.h - 1) }) }).map((c) => ({ ...r, w: r.w + 1, h: r.h + 1, ...c })),
);
const roomL: Prop<LIn, typeof roomAreaM2> = {
  fn: "roomAreaM2.lshape",
  area: "floorplans",
  seed: 4202,
  inputs: () => sample(lArb, 4202, 300),
  impl: roomAreaM2,
  check: (r, f) => {
    const got = f(lShape(r.x, r.y, r.w, r.h, r.cw, r.ch), r.ppm);
    const want = (r.w * r.h - r.cw * r.ch) / (r.ppm * r.ppm);
    // Reversed vertex order is the same room.
    const rev = f(lShape(r.x, r.y, r.w, r.h, r.cw, r.ch).reverse(), r.ppm);
    if (!close(got, rev)) return `area depends on winding: ${got} vs ${rev}`;
    return close(got, want) ? null : `L ${r.w}x${r.h} minus ${r.cw}x${r.ch} @${r.ppm}: got ${got}, want ${want}`;
  },
};

type PolyIn = { pts: Array<{ x: number; y: number }>; dx: number; dy: number };
const polyArb: fc.Arbitrary<PolyIn> = fc.record({
  pts: fc.array(fc.record({ x: fc.integer({ min: -3000, max: 3000 }), y: fc.integer({ min: -3000, max: 3000 }) }), { minLength: 3, maxLength: 10 }),
  dx: fc.integer({ min: -10000, max: 10000 }),
  dy: fc.integer({ min: -10000, max: 10000 }),
});
const shoelace: Prop<PolyIn, { a: typeof shoelaceAreaPx2; b: typeof shoelaceArea }> = {
  fn: "shoelace.agree",
  area: "floorplans",
  seed: 4203,
  inputs: () => sample(polyArb, 4203, 300),
  impl: { a: shoelaceAreaPx2, b: shoelaceArea },
  check: (p, f) => {
    const a = f.a(p.pts);
    const b = f.b(p.pts);
    const moved = f.a(p.pts.map((q) => ({ x: q.x + p.dx, y: q.y + p.dy })));
    const rev = f.a([...p.pts].reverse());
    if (a < 0) return `negative area ${a}`;
    if (a !== b) return `geometry-utils ${a} != extract-rooms ${b}`;
    if (a !== rev) return `winding changes area ${a} vs ${rev}`;
    // Integer vertices: twice the area is an integer, exactly representable here.
    return Math.abs(moved - a) < 1e-6 ? null : `translation changes area ${a} vs ${moved}`;
  },
};

type ResIn = { mode: "lw" | "areaM2" | "points" | "box"; l: number; w: number; sx: number; sy: number; ppm: number };
const resArb: fc.Arbitrary<ResIn> = fc.record({
  mode: fc.constantFrom("lw" as const, "areaM2" as const, "points" as const, "box" as const),
  l: fc.integer({ min: 1, max: 4000 }),
  w: fc.integer({ min: 1, max: 4000 }),
  sx: fc.constantFrom(1, 0.5, 2, 1.25),
  sy: fc.constantFrom(1, 0.5, 2, 0.8),
  ppm: ppmArb,
});
function resObj(r: ResIn) {
  if (r.mode === "lw") return { type: "polygon", data: { type: "room", lengthM: r.l / 100, widthM: r.w / 100 } };
  if (r.mode === "areaM2") return { type: "polygon", data: { type: "room", areaM2: (r.l * r.w) / 10000 } };
  if (r.mode === "points") return { type: "polygon", points: rect(0, 0, r.l, r.w), scaleX: r.sx, scaleY: r.sy, data: { type: "room" } };
  return { type: "rect", width: r.l, height: r.w, scaleX: r.sx, scaleY: r.sy, data: { type: "room" } };
}
function resWant(r: ResIn): { area: number; peri: number | null } {
  if (r.mode === "lw" || r.mode === "areaM2") return { area: (r.l * r.w) / 10000, peri: r.mode === "lw" ? (2 * (r.l + r.w)) / 100 : null };
  const L = (r.l * r.sx) / r.ppm;
  const W = (r.w * r.sy) / r.ppm;
  return { area: L * W, peri: r.mode === "points" ? 2 * (L + W) : null };
}
const resolveArea: Prop<ResIn, typeof resolveRoomAreaM2> = {
  fn: "resolveRoomAreaM2",
  area: "floorplans",
  seed: 4204,
  inputs: () => sample(resArb, 4204, 400),
  impl: resolveRoomAreaM2,
  check: (r, f) => {
    const got = f(resObj(r) as never, r.ppm);
    const want = resWant(r).area;
    return got !== null && close(got, want) ? null : `${j(resObj(r))} @${r.ppm}: got ${got}, want ${want}`;
  },
};

const resolvePeri: Prop<ResIn, typeof resolveRoomPerimeterM> = {
  fn: "resolveRoomPerimeterM",
  area: "floorplans",
  seed: 4205,
  inputs: () => sample(resArb.filter((r) => r.mode === "lw" || r.mode === "points"), 4205, 300),
  impl: resolveRoomPerimeterM,
  check: (r, f) => {
    const got = f(resObj(r) as never, r.ppm);
    const want = resWant(r).peri!;
    return got !== null && close(got, want) ? null : `${j(resObj(r))} @${r.ppm}: got ${got}, want ${want}`;
  },
};

const wallArea: Prop<ResIn & { hc: number }, typeof resolveWallAreaM2> = {
  fn: "resolveWallAreaM2",
  area: "floorplans",
  seed: 4206,
  inputs: () =>
    sample(
      resArb.filter((r) => r.mode === "lw" || r.mode === "points").chain((r) => fc.integer({ min: 200, max: 600 }).map((hc) => ({ ...r, hc }))),
      4206,
      200,
    ),
  impl: resolveWallAreaM2,
  check: (r, f) => {
    const o = resObj(r) as { data: Record<string, unknown> };
    o.data.ceilingHeightM = r.hc / 100;
    const got = f(o as never, r.ppm);
    const want = resWant(r).peri! * (r.hc / 100);
    return got !== null && close(got, want) ? null : `${j(o)} @${r.ppm}: got ${got}, want ${want}`;
  },
};

const units: Prop<{ milli: number; mode: number }, { a: typeof sqftToSqm; b: typeof sqmToSqft; c: typeof deriveAreaColumns; d: typeof resolveAreaSqm }> = {
  fn: "units.sqm-sqft",
  area: "floorplans",
  seed: 4207,
  inputs: () => sample(fc.record({ milli: fc.integer({ min: 1, max: 10_000_000 }), mode: fc.integer({ min: 0, max: 2 }) }), 4207, 300),
  impl: { a: sqftToSqm, b: sqmToSqft, c: deriveAreaColumns, d: resolveAreaSqm },
  check: ({ milli, mode }, f) => {
    const x = milli / 1000;
    if (mode === 0) {
      const sqm = f.a(x);
      if (!close(sqm, x * 0.09290304)) return `sqftToSqm(${x}) = ${sqm}, want ${x * 0.09290304}`;
      return close(f.b(sqm), x) ? null : `round trip ${x} sqft -> ${sqm} -> ${f.b(sqm)}`;
    }
    if (mode === 1) {
      const cols = f.c({ affectedAreaSqm: x });
      if (!cols) return `deriveAreaColumns(${x} m2) returned null`;
      return cols.affectedAreaSqm === x && close(cols.affectedSquareFootage * 0.09290304, x) ? null : `columns disagree ${j(cols)}`;
    }
    const got = f.d({ affectedAreaSqm: x, affectedSquareFootage: x * 1000 });
    return got === x ? null : `metric column must win: got ${got}, want ${x}`;
  },
};

// ── domain: ABN ─────────────────────────────────────────────────────────

function digitsFrom(r: () => number): string {
  let s = "";
  for (let i = 0; i < 11; i++) s += String(Math.floor(r() * 10));
  return s;
}
/** A seeded mulberry32 for constructions fast-check does not express well. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function validAbns(seed: number, n: number): string[] {
  const r = prng(seed);
  const out: string[] = ["51824753556"]; // ATO's published example ABN
  while (out.length < n) {
    const s = digitsFrom(r);
    if (abnOracle(s)) out.push(s);
  }
  return out;
}
function spaced(s: string): string {
  return `${s.slice(0, 2)} ${s.slice(2, 5)} ${s.slice(5, 8)} ${s.slice(8)}`;
}

function abnInputs(): unknown[] {
  const r = prng(4301);
  const valid = validAbns(4301, 250);
  const out: unknown[] = [];
  for (const v of valid) {
    out.push(v, spaced(v));
    const i = Math.floor(r() * 11);
    const d = (Number(v[i]) + 1 + Math.floor(r() * 9)) % 10;
    out.push(v.slice(0, i) + String(d) + v.slice(i + 1)); // one digit changed: never valid
  }
  for (let k = 0; k < 50; k++) {
    const s = digitsFrom(r);
    out.push(s, s.slice(0, 10), `${s}0`, s.replace(/^./, "A"), `${s.slice(0, 5)}-${s.slice(5)}`);
  }
  out.push(null, undefined, 51824753556, "", "           ", "00000000000", "１１１１１１１１１１１");
  return out;
}
export const ABN_SAMPLE_FLOOR = { valid: 200, invalid: 200 };

const abn: Prop<unknown, typeof isValidAbn> = {
  fn: "isValidAbn",
  area: "domain",
  seed: 4301,
  inputs: abnInputs,
  impl: isValidAbn,
  check: (x, f) => {
    const got = f(x as string);
    const want = abnOracle(x);
    return got === want ? null : `${j(x)}: got ${got}, ATO checksum says ${want}`;
  },
};

const abnLegacy: Prop<unknown, typeof isValidABN> = {
  fn: "isValidABN.sanitize",
  area: "domain",
  seed: 4302,
  inputs: () => abnInputs().filter((_, i) => i % 3 === 0),
  impl: isValidABN,
  check: (x, f) => {
    const got = f(x);
    const want = abnOracle(x);
    return got === want ? null : `${j(x)}: got ${got}, ATO checksum says ${want}`;
  },
};

const abnNorm: Prop<string, typeof normaliseAbn> = {
  fn: "normaliseAbn.idempotent",
  area: "domain",
  seed: 4303,
  inputs: () => [...validAbns(4303, 100).map(spaced), ...sample(fc.string({ maxLength: 20 }), 4303, 100)],
  impl: normaliseAbn,
  check: (x, f) => {
    const once = f(x);
    const twice = once === null ? null : f(once);
    if (once !== twice) return `${j(x)}: once ${j(once)}, twice ${j(twice)}`;
    if (abnOracle(x) && once !== x.replace(/\s+/g, "")) return `${j(x)} normalised to ${j(once)}`;
    return null;
  },
};

const abnFormat: Prop<string, typeof formatABN> = {
  fn: "formatABN",
  area: "domain",
  seed: 4304,
  inputs: () => validAbns(4304, 200),
  impl: formatABN,
  check: (x, f) => {
    const got = f(x);
    return got === spaced(x) ? null : `${x}: got ${j(got)}, want ${spaced(x)}`;
  },
};

// ── domain: text ────────────────────────────────────────────────────────

const textArb = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.constantFrom("Smith & Sons", "O'Brien", 'He said "dry"', "RH < 40% & > 20%", "<b>bold</b>", "Tom & Jerry's <Shop>"),
  fc.array(fc.constantFrom("a", "&", "<", ">", '"', "'", " ", "x", "<i>"), { maxLength: 12 }).map((a) => a.join("")),
);
const sanitizeIdem: Prop<string, typeof sanitizeString> = {
  fn: "sanitizeString.idempotent",
  area: "domain",
  seed: 4305,
  inputs: () => sample(textArb, 4305, 400),
  impl: sanitizeString,
  check: (x, f) => {
    const once = f(x);
    const twice = f(once);
    return once === twice ? null : `re-saving changes the text: ${j(x)} -> ${j(once)} -> ${j(twice)}`;
  },
};

// ── domain: IICRC ───────────────────────────────────────────────────────

const wmeArb = fc.oneof(
  fc.integer({ min: 0, max: 2000 }).map((k) => k / 20),
  fc.constantFrom(0, 14.999, 15, 15.001, 24.999, 25, 39.999, 40, 100),
);
const iicrc: Prop<number, typeof deriveIicrClass> = {
  fn: "deriveIicrClass",
  area: "domain",
  seed: 4401,
  inputs: () => sample(wmeArb, 4401, 400),
  impl: deriveIicrClass,
  check: (w, f) => {
    const got = f(w);
    const want = iicrcClassOracle(w);
    if (got !== want) return `WME ${w}%: got Class ${got}, band says Class ${want}`;
    const info = IICRC_CLASSES[got - 1];
    return w >= info.thresholdMin && w < info.thresholdMax ? null : `WME ${w}% outside Class ${got}'s own table range ${info.thresholdMin}-${info.thresholdMax}`;
  },
};

type MsIn = { mat: string; a: number; b: number };
const MATERIALS = [...IICRC_DRY_STANDARDS.map((s) => s.material), "unknown-material", ""];
const moisture: Prop<MsIn, typeof getMoistureStatus> = {
  fn: "getMoistureStatus",
  area: "domain",
  seed: 4402,
  inputs: () =>
    sample(fc.record({ mat: fc.constantFrom(...MATERIALS), a: fc.integer({ min: 0, max: 600 }), b: fc.integer({ min: 0, max: 600 }) }), 4402, 400),
  impl: getMoistureStatus,
  check: ({ mat, a, b }, f) => {
    const std = IICRC_DRY_STANDARDS.find((s) => s.material === mat) ?? IICRC_DRY_STANDARDS.find((s) => s.material === "other")!;
    const la = a / 10;
    const got = f(la, mat);
    const want = la <= std.dryThreshold ? "dry" : la <= std.wetThreshold ? "drying" : "wet";
    if (got !== want) return `${mat} at ${la}%: got ${got}, want ${want} (dry<=${std.dryThreshold}, wet>${std.wetThreshold})`;
    const rank = { dry: 0, drying: 1, wet: 2 } as const;
    const [lo, hi] = a <= b ? [a / 10, b / 10] : [b / 10, a / 10];
    return rank[f(lo, mat)] <= rank[f(hi, mat)] ? null : `wetter reading ${hi}% reads drier than ${lo}% on ${mat}`;
  },
};

const FILLER = ["kitchen", "after storm", "upstairs", "reported by tenant", "", "unit 4", "overnight", "supply line", "drain hose"];
const ALL_IND = [...WATER_INDICATORS[1], ...WATER_INDICATORS[2], ...WATER_INDICATORS[3]];
const waterArb = fc.oneof(
  fc.array(fc.constantFrom(...ALL_IND, ...FILLER), { minLength: 0, maxLength: 4 }).map((a) => a.join(" ").trim()),
  fc.constantFrom(...ALL_IND),
  // Same sources in lower or upper case: capitalisation must not change the category.
  fc
    .tuple(fc.array(fc.constantFrom(...ALL_IND, ...FILLER), { minLength: 1, maxLength: 3 }), fc.boolean())
    .map(([a, up]) => (up ? a.join(" ").toUpperCase() : a.join(" ").toLowerCase()).trim()),
);
const water: Prop<string, typeof extractWaterCategory> = {
  fn: "extractWaterCategory",
  area: "domain",
  seed: 4403,
  inputs: () => sample(waterArb, 4403, 400),
  impl: extractWaterCategory,
  check: (s, f) => {
    const got = f(s);
    const want = waterCategoryOracle(s);
    return got === want ? null : `source ${j(s)}: got ${got}, worst indicator present is ${want}`;
  },
};

// ── domain: equipment ───────────────────────────────────────────────────

type AmIn = { a10: number; b10: number; cls: 1 | 2 | 3 | 4 };
const amArb: fc.Arbitrary<AmIn> = fc.record({
  a10: fc.integer({ min: 0, max: 20_000 }),
  b10: fc.integer({ min: 0, max: 20_000 }),
  cls: fc.constantFrom(1 as const, 2 as const, 3 as const, 4 as const),
});
const PER_MOVER = { 1: 20, 2: 15, 3: 10, 4: 8 } as const;
const ceilDiv = (n: number, d: number) => Math.floor((n + d - 1) / d);

const airMovers: Prop<AmIn, typeof calculateAirMoversRequired> = {
  fn: "calculateAirMoversRequired",
  area: "domain",
  seed: 4501,
  inputs: () => sample(amArb, 4501, 400),
  impl: calculateAirMoversRequired,
  check: ({ a10, b10, cls }, f) => {
    const got = f(a10 / 10, cls);
    const want = ceilDiv(a10, PER_MOVER[cls] * 10);
    if (got !== want) return `${a10 / 10} m2 Class ${cls}: got ${got}, want ceil(area/${PER_MOVER[cls]}) = ${want}`;
    const [lo, hi] = a10 <= b10 ? [a10, b10] : [b10, a10];
    if (f(lo / 10, cls) > f(hi / 10, cls)) return `more wet area (${hi / 10}) gives fewer movers than ${lo / 10}`;
    if (cls < 4 && f(a10 / 10, cls) > f(a10 / 10, (cls + 1) as 2 | 3 | 4)) return `Class ${cls + 1} gives fewer movers than Class ${cls} at ${a10 / 10} m2`;
    return null;
  },
};

const airMoversNeg: Prop<number, typeof calculateAirMoversRequired> = {
  fn: "calculateAirMoversRequired.nonNegative",
  area: "domain",
  seed: 4502,
  inputs: () => sample(fc.integer({ min: -100_000, max: -1 }), 4502, 100),
  impl: calculateAirMoversRequired,
  check: (a10, f) => {
    const got = f(a10 / 10, 2);
    return got >= 0 ? null : `area ${a10 / 10} m2 gives a negative count ${got}`;
  },
};

type SiteIn = { a10: number; b10: number; por: "low" | "medium" | "high"; fur: "light" | "moderate" | "heavy" };
const siteArb: fc.Arbitrary<SiteIn> = fc.record({
  a10: fc.integer({ min: 1, max: 20_000 }),
  b10: fc.integer({ min: 1, max: 20_000 }),
  por: fc.constantFrom("low" as const, "medium" as const, "high" as const),
  fur: fc.constantFrom("light" as const, "moderate" as const, "heavy" as const),
});
const idealAM: Prop<SiteIn, typeof idealAirMovers> = {
  fn: "idealAirMovers",
  area: "domain",
  seed: 4503,
  inputs: () => sample(siteArb, 4503, 300),
  impl: idealAirMovers,
  check: ({ a10, b10, por, fur }, f) => {
    const s = (a: number, p = por, u = fur) => f({ affectedAreaM2: a / 10, mouldActive: false, porosity: p, furniture: u });
    const [lo, hi] = a10 <= b10 ? [a10, b10] : [b10, a10];
    if (s(a10) < 1) return `${a10 / 10} m2 gives ${s(a10)} movers (min 1)`;
    if (s(lo) > s(hi)) return `more wet area (${hi / 10} m2 -> ${s(hi)}) gives fewer movers than ${lo / 10} m2 -> ${s(lo)} (${por}/${fur})`;
    if (s(a10, "low") > s(a10, "high")) return `high porosity needs fewer movers than low at ${a10 / 10} m2`;
    if (s(a10, por, "light") > s(a10, por, "heavy")) return `heavy furniture needs fewer movers than light at ${a10 / 10} m2`;
    return null;
  },
};

const idealDH: Prop<SiteIn, typeof idealDehumidifiers> = {
  fn: "idealDehumidifiers",
  area: "domain",
  seed: 4504,
  inputs: () => sample(siteArb, 4504, 300),
  impl: idealDehumidifiers,
  check: ({ a10 }, f) => {
    const got = f({ affectedAreaM2: a10 / 10, mouldActive: false });
    const want = Math.max(1, ceilDiv(a10, 200));
    return got === want ? null : `${a10 / 10} m2: got ${got}, want max(1, ceil(area/20)) = ${want}`;
  },
};

const recEquip: Prop<{ a10: number; b10: number }, typeof recommendEquipment> = {
  fn: "recommendEquipment",
  area: "domain",
  seed: 4505,
  inputs: () => sample(fc.record({ a10: fc.integer({ min: 1, max: 20_000 }), b10: fc.integer({ min: 1, max: 20_000 }) }), 4505, 300),
  impl: recommendEquipment,
  check: ({ a10, b10 }, f) => {
    const got = f(a10 / 10);
    const want = { dehumidifiers: Math.max(1, ceilDiv(a10, 400)), airMovers: Math.max(1, ceilDiv(a10, 150)), airScrubbers: Math.max(1, ceilDiv(a10, 1000)) };
    if (got.dehumidifiers !== want.dehumidifiers || got.airMovers !== want.airMovers || got.airScrubbers !== want.airScrubbers)
      return `${a10 / 10} m2: got ${j(got)}, want ${j(want)}`;
    const [lo, hi] = a10 <= b10 ? [a10, b10] : [b10, a10];
    return f(lo / 10).airMovers <= f(hi / 10).airMovers ? null : `more wet area gives fewer air movers (${lo / 10} vs ${hi / 10})`;
  },
};

const afd: Prop<{ a10: number; req: boolean }, typeof calculateAFDUnitsRequired> = {
  fn: "calculateAFDUnitsRequired",
  area: "domain",
  seed: 4506,
  inputs: () => sample(fc.record({ a10: fc.integer({ min: 0, max: 20_000 }), req: fc.boolean() }), 4506, 200),
  impl: calculateAFDUnitsRequired,
  check: ({ a10, req }, f) => {
    const got = f(a10 / 10, req);
    const want = req ? Math.max(1, ceilDiv(a10, 500)) : 0;
    return got === want ? null : `${a10 / 10} m2 required=${req}: got ${got}, want ${want}`;
  },
};

type PlanIn = { a10: number; mould: boolean; circuits: number; rating: number; por: SiteIn["por"]; fur: SiteIn["fur"] };
const plan: Prop<PlanIn, typeof planDrying> = {
  fn: "planDrying",
  area: "domain",
  seed: 4507,
  inputs: () =>
    sample(
      fc.record({
        a10: fc.integer({ min: 1, max: 5_000 }),
        mould: fc.boolean(),
        circuits: fc.integer({ min: 1, max: 6 }),
        rating: fc.constantFrom(10, 15, 16, 20, 32),
        por: fc.constantFrom("low" as const, "medium" as const, "high" as const),
        fur: fc.constantFrom("light" as const, "moderate" as const, "heavy" as const),
      }),
      4507,
      300,
    ),
  impl: planDrying,
  check: (x, f) => {
    const p = f({ affectedAreaM2: x.a10 / 10, mouldActive: x.mould, porosity: x.por, furniture: x.fur }, { circuits: x.circuits, circuitRatingA: x.rating });
    const ideal = idealAirMovers({ affectedAreaM2: x.a10 / 10, mouldActive: x.mould, porosity: x.por, furniture: x.fur });
    if (x.mould) {
      const p1 = p.phases.find((ph) => ph.phase === 1);
      if (!p1) return "mould job has no Phase 1";
      if (p1.airMoversAllowed || p1.lines.some((l) => l.kind === "air_mover" && l.quantity > 0)) return "air movers in Phase 1 while mould is active";
    }
    for (const ph of p.phases) {
      for (const l of ph.lines) if (!(l.quantity >= 0) || !Number.isInteger(l.quantity)) return `phase ${ph.phase} ${l.kind} quantity ${l.quantity}`;
      const am = ph.lines.filter((l) => l.kind === "air_mover").reduce((s, l) => s + l.quantity, 0);
      if (am > ideal) return `phase ${ph.phase} has ${am} air movers, more than the ideal ${ideal}`;
      const sumA = ph.lines.reduce((s, l) => s + l.ampsEach * l.quantity, 0);
      if (Math.abs(sumA - ph.packing.totalA) > 0.05 + 1e-9) return `phase ${ph.phase} totalA ${ph.packing.totalA} != sum of lines ${sumA}`;
      if (ph.packing.fits && ph.packing.perCircuitA.some((a) => a > p.budget.perCircuitUsableA + 1e-9)) return `phase ${ph.phase} says fits but a circuit carries more than ${p.budget.perCircuitUsableA}A: ${j(ph.packing.perCircuitA)}`;
      if (!p.powerConstrained && !ph.packing.fits) return `phase ${ph.phase} does not fit the supply but the plan is not flagged powerConstrained`;
    }
    return null;
  },
};

// ── domain: formatting ──────────────────────────────────────────────────

const centsAnyArb = fc.oneof(fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }), fc.integer({ min: -1000, max: 1000 }));
const fmtCents: Prop<number, typeof formatCurrencyCents> = {
  fn: "formatCurrencyCents",
  area: "domain",
  seed: 4601,
  inputs: () => sample(centsAnyArb, 4601, 400),
  impl: formatCurrencyCents,
  check: (c, f) => {
    const got = f(c);
    const want = audOracle(c);
    return got === want ? null : `${c}c: got ${j(got)}, want ${j(want)}`;
  },
};

const fmtMoney: Prop<number, typeof formatMoney> = {
  fn: "formatMoney.AU",
  area: "domain",
  seed: 4602,
  inputs: () => sample(centsAnyArb, 4602, 200),
  impl: formatMoney,
  check: (c, f) => {
    const got = f(c, "AU");
    const want = audOracle(c);
    return got === want ? null : `${c}c: got ${j(got)}, want ${j(want)}`;
  },
};

const fmtDate: Prop<number, typeof formatDate> = {
  fn: "formatDate",
  area: "domain",
  seed: 4603,
  inputs: () => sample(fc.integer({ min: 0, max: 4_102_444_799_000 }), 4603, 300),
  impl: formatDate,
  check: (ms, f) => {
    const d = new Date(ms);
    const got = f(d);
    const want = auDateOracle(d);
    if (got !== want) return `${d.toISOString()}: got ${j(got)}, want ${want}`;
    const viaIso = f(d.toISOString());
    return viaIso === want ? null : `ISO string ${d.toISOString()} formats as ${j(viaIso)}, Date formats as ${want}`;
  },
};

export const PROPS: Prop[] = [
  gstAU,
  gstNZ,
  lineAmounts,
  invPlain,
  invPct,
  invAmt,
  invShip,
  d2c,
  lineTot,
  minCharge,
  estimate,
  roomRect,
  roomL,
  shoelace,
  resolveArea,
  resolvePeri,
  wallArea,
  units,
  abn,
  abnLegacy,
  abnNorm,
  abnFormat,
  sanitizeIdem,
  iicrc,
  moisture,
  water,
  airMovers,
  airMoversNeg,
  idealAM,
  idealDH,
  recEquip,
  afd,
  plan,
  fmtCents,
  fmtMoney,
  fmtDate,
];

export function propByFn(fn: string): Prop {
  const p = PROPS.find((x) => x.fn === fn);
  if (!p) throw new Error(`no J4 property ${fn}`);
  return p;
}
