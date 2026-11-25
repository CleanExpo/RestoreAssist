/**
 * RA-8498 review rounds 1 and 2 — static guard: visit write decisions have one
 * owner.
 *
 * Both rounds found the same kind of defect: a route read something before
 * the locked write (the job's status, the visit's times), decided on it, and
 * wrote inside the lock, so a change landing in between was never seen. The
 * fix is a design rule: the visit write routes make no database read at all;
 * lib/site-visits/visit-writes.ts reads and writes only on the transaction
 * client it gets after claiming the job row. This test keeps it that way.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const VISITS = "app/api/inspections/[id]/visits";

describe("visit write decisions are made only under the job lock (RA-8498)", () => {
  it.each([`${VISITS}/[visitId]/route.ts`, `${VISITS}/[visitId]/submit/route.ts`])(
    "%s does not use the root database client",
    (rel) => {
      expect(read(rel)).not.toMatch(/@\/lib\/prisma|\bprisma\./);
    },
  );

  it("the start handler (POST) does not use the root database client", () => {
    const src = read(`${VISITS}/route.ts`);
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post.length).toBeGreaterThan(100);
    expect(post).not.toMatch(/\bprisma\./);
  });

  it("visit-writes.ts reaches the database only through the locked transaction client", () => {
    const src = read("lib/site-visits/visit-writes.ts");
    expect(src).not.toMatch(/@\/lib\/prisma|\bprisma\./);
    // Every write path goes through the one lock helper.
    for (const fn of ["startVisit", "patchVisit", "submitVisit"]) {
      const body = src.slice(src.indexOf(`export function ${fn}`));
      expect(body.slice(0, body.indexOf("\n}\n"))).toMatch(/underJobLock\(/);
    }
  });
});
