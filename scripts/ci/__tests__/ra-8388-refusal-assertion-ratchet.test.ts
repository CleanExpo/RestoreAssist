/**
 * RA-8388: a refusal test names the reason, not only the status.
 *
 * Why this guard exists. `expect(res.status).toBe(400)` passes for every 400
 * the route can give. Five signing tests asserted only that, sent a malformed
 * request by mistake, and stayed green with the check they were named after
 * switched off. Strengthening those five does not stop the next one, so the
 * design changes: a refusal is asserted through `expectRefused`
 * (`tests/helpers/expect-refused.ts`), which cannot be called without a
 * reason, and this test counts the bare status assertions that remain.
 *
 * The count may only go DOWN. A file not listed below is allowed none.
 *
 * Named limit, not a claim: the numbers below are the bare status assertions
 * that existed when this guard was written. They are NOT each proven to be
 * backed by a reason; many are followed by a body assertion, some are not.
 * This guard stops new ones. It also does not see a status held in a
 * variable (`toBe(STATUS)`), an assertion split across lines in a way the
 * pattern does not match, or test folders outside FOLDERS.
 *
 * To watch it fail: add `expect(res.status).toBe(400);` to any test in
 * `app/api/inspections/[id]/evidence/__tests__/route.signed-metadata.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expectRefused } from "@/tests/helpers/expect-refused";

const REPO = resolve(__dirname, "../../..");

/** The test folders of the routes and library this change touched. */
const FOLDERS = [
  "app/api/admin/evidence-review/__tests__",
  "app/api/inspections/[id]/draft-snapshot/__tests__",
  "app/api/inspections/[id]/evidence/__tests__",
  "app/api/inspections/[id]/insurer-profile/__tests__",
  "app/api/inspections/[id]/submit/__tests__",
  "app/api/inspections/[id]/workflow/__tests__",
  "app/api/inspections/[id]/workflow/validate/__tests__",
  "lib/evidence/__tests__",
];

/** Bare status assertions present on 17/11/2026. Lower a number; never raise. */
const BASELINE: Record<string, number> = {
  "app/api/admin/evidence-review/__tests__/route.test.ts": 2,
  "app/api/inspections/[id]/draft-snapshot/__tests__/d028-owner-only.test.ts": 2,
  "app/api/inspections/[id]/draft-snapshot/__tests__/ra7610-tenancy.test.ts": 1,
  "app/api/inspections/[id]/draft-snapshot/__tests__/route.test.ts": 6,
  "app/api/inspections/[id]/draft-snapshot/__tests__/signed-rows.test.ts": 12,
  "app/api/inspections/[id]/evidence/__tests__/route.client-seam.test.ts": 2,
  "app/api/inspections/[id]/evidence/__tests__/route.delete-linked.test.ts": 4,
  "app/api/inspections/[id]/evidence/__tests__/route.delete-photo.test.ts": 2,
  "app/api/inspections/[id]/evidence/__tests__/route.multipart.test.ts": 17,
  "app/api/inspections/[id]/evidence/__tests__/route.readback-reach.integration.test.ts": 1,
  "app/api/inspections/[id]/evidence/__tests__/route.signed-manifest.test.ts": 18,
  "app/api/inspections/[id]/evidence/__tests__/route.tenancy-refusal-log.test.ts": 3,
  "app/api/inspections/[id]/evidence/__tests__/route.test.ts": 2,
  "app/api/inspections/[id]/insurer-profile/__tests__/route.test.ts": 8,
  "app/api/inspections/[id]/submit/__tests__/fire-walkthrough-gate.test.ts": 4,
  "app/api/inspections/[id]/submit/__tests__/ra7610-sketch-room-join.test.ts": 6,
  "app/api/inspections/[id]/submit/__tests__/ra7739-make-safe-not-assessed.test.ts": 2,
  "app/api/inspections/[id]/workflow/__tests__/route.test.ts": 2,
  "lib/evidence/__tests__/authoritative-dual-write.test.ts": 2,
  "lib/evidence/__tests__/device-signing.test.ts": 1,
};

const BARE_STATUS =
  /expect\(\s*[\w.$]+\.status\s*\)\s*\.(?:toBe|toEqual)\(\s*[45]\d\d\s*\)/g;

function bareStatusCount(source: string): number {
  return source.match(BARE_STATUS)?.length ?? 0;
}

function testFiles(): string[] {
  const files: string[] = [];
  for (const folder of FOLDERS) {
    for (const name of readdirSync(resolve(REPO, folder))) {
      if (/\.test\.tsx?$/.test(name)) files.push(`${folder}/${name}`);
    }
  }
  return files.sort();
}

describe("expectRefused, the owner", () => {
  const refusal = (status: number, message: string) =>
    Response.json({ error: { code: "VALIDATION", message } }, { status });

  it("passes when the status and the reason both match", async () => {
    const body = await expectRefused(
      refusal(400, "evidenceId is required"),
      400,
      /evidenceId is required/,
    );
    expect(body).toEqual({
      error: { code: "VALIDATION", message: "evidenceId is required" },
    });
  });

  it("fails when the status matches and the reason does not", async () => {
    await expect(
      expectRefused(refusal(400, "Invalid JSON"), 400, /evidenceId is required/),
    ).rejects.toThrow(/evidenceId is required/);
  });

  it("fails when the reason matches and the status does not", async () => {
    await expect(
      expectRefused(
        refusal(403, "evidenceId is required"),
        400,
        /evidenceId is required/,
      ),
    ).rejects.toThrow();
  });

  it.each([
    ["an empty pattern", new RegExp("")],
    ["a pattern that matches anything", /.*/],
    ["a two-character pattern", /id/],
  ])("will not accept %s as a reason", async (_name, reason) => {
    await expect(
      expectRefused(refusal(400, "evidenceId is required"), 400, reason),
    ).rejects.toThrow(/does not name a reason/);
  });

  it("will not accept a success status", async () => {
    await expect(
      expectRefused(Response.json({ ok: true }), 200, /anything at all/),
    ).rejects.toThrow(/not a refusal status/);
  });
});

describe("bare status assertions only go down (RA-8388 test folders)", () => {
  const files = testFiles();

  it("reads the folders it claims to read", () => {
    // A guard that finds no files passes for the wrong reason.
    expect(files.length).toBeGreaterThanOrEqual(Object.keys(BASELINE).length);
    for (const listed of Object.keys(BASELINE)) expect(files).toContain(listed);
  });

  it("no test file has more bare status assertions than its baseline", () => {
    const over = files
      .map((file) => ({
        file,
        found: bareStatusCount(readFileSync(resolve(REPO, file), "utf8")),
        allowed: BASELINE[file] ?? 0,
      }))
      .filter((row) => row.found > row.allowed);

    expect(
      over,
      "assert a refusal with expectRefused(res, status, /reason/) from " +
        "@/tests/helpers/expect-refused, not a bare status",
    ).toEqual([]);
  });

  it("the baseline is not left higher than what is there", () => {
    // A stale allowance is room for a new bare assertion to hide in.
    const slack = Object.entries(BASELINE)
      .map(([file, allowed]) => ({
        file,
        allowed,
        found: bareStatusCount(readFileSync(resolve(REPO, file), "utf8")),
      }))
      .filter((row) => row.found < row.allowed);

    expect(slack, "lower these baseline numbers to match").toEqual([]);
  });

  it("counts the assertion it exists for, and not a success or a helper", () => {
    expect(bareStatusCount("expect(res.status).toBe(400);")).toBe(1);
    expect(bareStatusCount("expect(response.status).toEqual(503)")).toBe(1);
    expect(bareStatusCount("expect(res.status).toBe(201);")).toBe(0);
    expect(bareStatusCount("await expectRefused(res, 400, /why/);")).toBe(0);
  });
});
