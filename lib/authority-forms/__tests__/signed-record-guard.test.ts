/**
 * RA-8400 — the signed-record rules, and the writer allow-list that stops a
 * new route from writing an authority form or signature without them.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formAcceptsSignatureWhere,
  formSignatureRefusal,
  formTextEditRefusal,
  noSignedSignatureWhere,
  statusMoveRefusal,
  unsignedSlotWhere,
} from "../signed-record-guard";

describe("signed-record rules", () => {
  it("refuses a signature on a cancelled or completed form", () => {
    expect(formSignatureRefusal({ status: "CANCELLED" })).toMatch(/cancelled/);
    expect(formSignatureRefusal({ status: "COMPLETED" })).toMatch(/complete/);
    expect(formSignatureRefusal({ status: "DRAFT" })).toBeNull();
    expect(formSignatureRefusal({ status: "PENDING_SIGNATURES" })).toBeNull();
    expect(formSignatureRefusal({ status: "PARTIALLY_SIGNED" })).toBeNull();
  });

  it("refuses a wording change once any signature is signed", () => {
    expect(
      formTextEditRefusal({
        signatures: [{ signedAt: null }, { signedAt: new Date() }],
      }),
    ).toMatch(/signed/);
    expect(
      formTextEditRefusal({ signatures: [{ signedAt: null }] }),
    ).toBeNull();
    expect(formTextEditRefusal({ signatures: [] })).toBeNull();
  });

  it("allows only the listed staff status moves", () => {
    expect(statusMoveRefusal("DRAFT", "CANCELLED")).toBeNull();
    expect(statusMoveRefusal("PENDING_SIGNATURES", "CANCELLED")).toBeNull();
    for (const from of [
      "DRAFT",
      "PENDING_SIGNATURES",
      "PARTIALLY_SIGNED",
      "COMPLETED",
      "CANCELLED",
    ]) {
      expect(statusMoveRefusal(from, "COMPLETED")).not.toBeNull();
      expect(statusMoveRefusal(from, "PARTIALLY_SIGNED")).not.toBeNull();
    }
    expect(statusMoveRefusal("COMPLETED", "CANCELLED")).not.toBeNull();
    expect(statusMoveRefusal("CANCELLED", "DRAFT")).not.toBeNull();
    expect(statusMoveRefusal("DRAFT", 42)).not.toBeNull();
  });

  it("write fragments carry the same rules", () => {
    expect(formAcceptsSignatureWhere()).toEqual({
      status: { notIn: ["CANCELLED", "COMPLETED"] },
    });
    expect(unsignedSlotWhere()).toEqual({ signedAt: null });
    expect(noSignedSignatureWhere()).toEqual({
      signatures: { none: { signedAt: { not: null } } },
    });
  });
});

// ---------------------------------------------------------------------------
// Writer allow-list
// ---------------------------------------------------------------------------

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCAN_ROOTS = ["app/api", "lib"];
const WRITE_CALL =
  /\b(authorityFormInstance|authorityFormSignature)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
const GUARD_IMPORT = /from\s+["']@\/lib\/authority-forms\/signed-record-guard["']/;

/** Writers that must take their rule from the guard module. */
const GUARDED_WRITERS = [
  "app/api/authority-forms/[id]/route.ts",
  "app/api/authority-forms/[id]/signatures/route.ts",
  "app/api/authority-forms/sign/[token]/route.ts",
];

/** Writers reviewed and left unguarded, each with its reason. */
const EXEMPT_WRITERS: Record<string, string> = {
  "app/api/reports/[id]/authority-forms/route.ts":
    "creates a new DRAFT form and its empty signature slots; nothing is signed yet",
  "app/api/authority-forms/[id]/send-signature-request/route.ts":
    "issues a signing token only; writes no wording or signature, and the sign route refuses a closed form",
  "lib/portal/clear-client-signing-links.ts":
    "clears signing tokens to revoke links; only removes the ability to sign",
};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
}

function findWriters(): string[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
  return files
    .filter((f) => WRITE_CALL.test(readFileSync(f, "utf8")))
    .map((f) => relative(REPO_ROOT, f).split(sep).join("/"))
    .sort();
}

describe("authority-form writer allow-list (RA-8400)", () => {
  const writers = findWriters();

  it("scan finds the known writers (positive control: an empty scan fails)", () => {
    expect(writers.length).toBeGreaterThanOrEqual(
      GUARDED_WRITERS.length + Object.keys(EXEMPT_WRITERS).length,
    );
    for (const f of GUARDED_WRITERS) expect(writers).toContain(f);
  });

  it("every writer is either guarded or a reviewed exemption", () => {
    const listed = new Set([...GUARDED_WRITERS, ...Object.keys(EXEMPT_WRITERS)]);
    const unlisted = writers.filter((f) => !listed.has(f));
    expect(
      unlisted,
      "New authority-form writer: import lib/authority-forms/signed-record-guard and add it to GUARDED_WRITERS, or add a reviewed reason to EXEMPT_WRITERS",
    ).toEqual([]);
    const stale = [...listed].filter((f) => !writers.includes(f));
    expect(stale, "Allow-list names a file that no longer writes").toEqual([]);
  });

  it("every guarded writer imports the guard module", () => {
    for (const f of GUARDED_WRITERS) {
      const src = readFileSync(join(REPO_ROOT, f), "utf8");
      expect(GUARD_IMPORT.test(src), `${f} must import the guard`).toBe(true);
    }
  });
});
