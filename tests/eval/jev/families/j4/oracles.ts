/**
 * J4 oracles — independent re-statements of each domain rule. None of these
 * call the product function they judge; they are written from the rule
 * (ATO, IICRC S500 as documented in the product, plain geometry) in exact
 * integer arithmetic so a binary-float slip in the product shows up.
 */

/** Round n / d half up, n >= 0, d > 0, exact. */
export function halfUpDiv(n: bigint, d: bigint): bigint {
  if (n < 0n) throw new Error("halfUpDiv: negative numerator");
  return (2n * n + d) / (2n * d);
}

/** GST in cents on a non-negative cents subtotal at an integer percent. */
export function gstCentsOracle(subtotalCents: number, ratePercent: number): number {
  return Number(halfUpDiv(BigInt(subtotalCents) * BigInt(ratePercent), 100n));
}

/** ATO ABN check: subtract 1 from the first digit, weight, sum, mod 89 = 0. */
export function abnOracle(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const s = input.replace(/\s+/g, "");
  if (s.length !== 11) return false;
  for (const ch of s) if (ch < "0" || ch > "9") return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const d = s.charCodeAt(i) - 48 - (i === 0 ? 1 : 0);
    sum += d * w[i];
  }
  return sum % 89 === 0;
}

/** "$1,234.56" / "-$1,234.56" from integer cents, en-AU AUD. */
export function audOracle(cents: number): string {
  const neg = cents < 0;
  const abs = BigInt(Math.abs(cents));
  const dollars = (abs / 100n).toString();
  const c = (abs % 100n).toString().padStart(2, "0");
  const grouped = dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${grouped}.${c}`;
}

/** dd/mm/yyyy in the process's local calendar. */
export function auDateOracle(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Category by highest contamination present (S500: the worst source governs). */
export const WATER_INDICATORS: Record<1 | 2 | 3, string[]> = {
  1: ["Burst pipe", "Roof leak", "Hot water service failure", "Washing machine"],
  // The product's own docstring: "Category 2 (grey water): overflow toilets, dishwasher discharge".
  2: ["Overflowing toilet", "Grey water", "Dishwasher"],
  3: ["Flood", "Sewage backup", "Biohazard", "Contaminated"],
};

export function waterCategoryOracle(source: string): string {
  if (!source) return "Not specified";
  for (const cat of [3, 2, 1] as const) {
    if (WATER_INDICATORS[cat].some((s) => source.includes(s))) return `Category ${cat}`;
  }
  return "Category 1"; // documented default for an unrecognised source
}

/** IICRC class bands as the product documents them (S500 §8.1 table). */
export function iicrcClassOracle(wme: number): 1 | 2 | 3 | 4 {
  if (wme < 15) return 1;
  if (wme < 25) return 2;
  if (wme < 40) return 3;
  return 4;
}

/** Rectilinear polygon from a w x h rectangle with an (cw x ch) corner cut out. */
export function lShape(x: number, y: number, w: number, h: number, cw: number, ch: number) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h - ch },
    { x: x + w - cw, y: y + h - ch },
    { x: x + w - cw, y: y + h },
    { x, y: y + h },
  ];
}

export function rect(x: number, y: number, w: number, h: number) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/** Relative closeness for float geometry. */
export function close(a: number, b: number, rel = 1e-9): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
}
