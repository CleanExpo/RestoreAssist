/**
 * JEV result records — one JSON line per result in out/<FAMILY>.jsonl.
 *
 * A case's state comes from classify(): a failing case listed in
 * known-gaps/*.json is KNOWN_GAP; a listed case that now passes is PASS with
 * "known gap flipped". A control's state is the detector's verdict on a
 * planted defect, so FAIL means the defect was caught.
 */
import fs from "node:fs";
import path from "node:path";

export type JevState = "PASS" | "FAIL" | "KNOWN_GAP" | "INCONCLUSIVE";
export type JevArea = "flow" | "photos" | "floorplans" | "crm" | "payments" | "security" | "domain";

export interface JevResult {
  id: string;
  family: string;
  kind: "case" | "control";
  state: JevState;
  area: JevArea;
  route?: string;
  identity?: string;
  detail?: string;
  gap_id?: string;
}

export const JEV_ROOT = path.resolve(__dirname, "..");
export const OUT_DIR = path.join(JEV_ROOT, "out");

type GapEntry = { key: string; prefix: boolean; gapId: string };
let gapIndex: GapEntry[] | null = null;

function loadGaps(): GapEntry[] {
  if (gapIndex) return gapIndex;
  const dir = path.join(JEV_ROOT, "known-gaps");
  const idx: GapEntry[] = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith(".json")) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const [gapId, g] of Object.entries<{ cases: string[] }>(doc.gaps ?? {})) {
      for (const c of g.cases) {
        idx.push(c.endsWith("*") ? { key: c.slice(0, -1), prefix: true, gapId } : { key: c, prefix: false, gapId });
      }
    }
  }
  gapIndex = idx;
  return idx;
}

/** Exact id first, then the longest matching prefix. */
export function knownGap(id: string): string | null {
  const idx = loadGaps();
  const exact = idx.find((g) => !g.prefix && g.key === id);
  if (exact) return exact.gapId;
  let best: { len: number; gapId: string } | null = null;
  for (const g of idx) {
    if (g.prefix && id.startsWith(g.key) && (!best || g.key.length > best.len)) {
      best = { len: g.key.length, gapId: g.gapId };
    }
  }
  return best?.gapId ?? null;
}

export function classify(
  id: string,
  passed: boolean,
  detail: string,
): Pick<JevResult, "state" | "detail" | "gap_id"> {
  const gap = knownGap(id);
  if (passed) return { state: "PASS", detail: gap ? `known gap flipped: ${gap}` : detail };
  if (gap) return { state: "KNOWN_GAP", detail, gap_id: gap };
  return { state: "FAIL", detail };
}

export function recordResults(family: string, results: JevResult[]): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const body = results.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(path.join(OUT_DIR, `${family}.jsonl`), body ? `${body}\n` : "");
}
