/**
 * J4 — domain invariants. Seeded property cases over the real pure functions
 * in lib/ (GST, invoice totals, estimate lines, minimum charge, sketch area
 * and perimeter, units, ABN, IICRC class / dry standard / water category,
 * equipment counts and the drying plan, AU formatting), each judged by an
 * independent oracle in families/j4/oracles.ts.
 *
 * One generated input is one case (J4-<fn>-<n>). A product/oracle mismatch,
 * or a throw on an in-domain input, is FAIL with the input in detail.
 * Controls run deliberately wrong implementations through the same checks.
 *
 * The functions are pure; estimateCosts imports prisma but is called with
 * explicit rates and no user, so it never reaches the database. The DB guard
 * matches the other families so the whole suite runs under one condition.
 */
import { afterAll, describe, it } from "vitest";
import { classify, recordResults, type JevResult } from "../runner/record";
import { ABN_SAMPLE_FLOOR, PROPS, propByFn, type Prop } from "./j4/properties";
import { abnOracle } from "./j4/oracles";
import { PLANTED_J4 } from "./j4/planted";

const FAMILY = "J4";
const results: JevResult[] = [];
afterAll(() => recordResults(FAMILY, results));

function show(p: Prop, input: unknown): string {
  if (p.show) return p.show(input);
  try {
    const s = JSON.stringify(input);
    return s === undefined ? String(input) : s.length > 300 ? `${s.slice(0, 300)}…` : s;
  } catch {
    return String(input);
  }
}

async function judge(p: Prop, input: unknown, impl: unknown): Promise<string | null> {
  try {
    return await p.check(input, impl);
  } catch (err) {
    return `threw ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`.slice(0, 300);
  }
}

describe.skipIf(!process.env.DATABASE_URL)("J4 domain invariants", () => {
  it("controls: wrong implementations are caught by the same oracles", async () => {
    for (const c of PLANTED_J4) {
      const p = propByFn(c.fn);
      const inputs = p.inputs();
      let mismatches = 0;
      let first = "";
      for (const input of inputs) {
        const m = await judge(p, input, c.wrong);
        if (m) {
          mismatches++;
          if (!first) first = m;
        }
      }
      results.push({
        id: c.id,
        family: FAMILY,
        kind: "control",
        area: p.area,
        state: mismatches > 0 ? "FAIL" : "PASS",
        detail: `${c.why}: ${mismatches}/${inputs.length} inputs flagged${first ? `; first: ${first}` : ""}`,
      });
    }
  });

  it("cases: every generated input against its oracle", async () => {
    for (const p of PROPS) {
      const inputs = p.inputs();
      for (let n = 0; n < inputs.length; n++) {
        const id = `J4-${p.fn}-${n}`;
        const m = await judge(p, inputs[n], p.impl);
        const detail = m ? `${m} | input ${show(p, inputs[n])} | seed ${p.seed}` : `seed ${p.seed}`;
        results.push({ id, family: FAMILY, kind: "case", area: p.area, ...classify(id, m === null, detail) });
      }
    }
    // Precondition for the always-true ABN control: the sample must hold both
    // kinds, or catching it would prove nothing.
    const abnInputs = propByFn("isValidAbn").inputs();
    const valid = abnInputs.filter((x) => abnOracle(x)).length;
    const invalid = abnInputs.length - valid;
    results.push({
      id: "J4-PRECOND-abn-mix",
      family: FAMILY,
      kind: "case",
      area: "domain",
      state: valid >= ABN_SAMPLE_FLOOR.valid && invalid >= ABN_SAMPLE_FLOOR.invalid ? "PASS" : "FAIL",
      detail: `ABN sample: ${valid} valid, ${invalid} invalid (floor ${ABN_SAMPLE_FLOOR.valid}/${ABN_SAMPLE_FLOOR.invalid})`,
    });
  });
});
