/**
 * RA-8400 — the signed-record rules, and the writer allow-list that stops a
 * new route from writing an authority form or signature without them.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formAcceptsSignatureWhere,
  formNewSlotRefusal,
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

  it("refuses a new slot on a closed form or once any signature is signed", () => {
    expect(formNewSlotRefusal({ status: "CANCELLED", signatures: [] })).toMatch(/cancelled/);
    expect(
      formNewSlotRefusal({ status: "PENDING_SIGNATURES", signatures: [{ signedAt: new Date() }] }),
    ).toMatch(/new signatory/);
    expect(
      formNewSlotRefusal({ status: "PENDING_SIGNATURES", signatures: [{ signedAt: null }] }),
    ).toBeNull();
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
// RA-8526: all server code and scripts, not only app/api.
const SCAN_ROOTS = ["app", "lib", "scripts"];
const WRITE_CALL =
  /\b(authorityFormInstance|authorityFormSignature)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
const GUARD_IMPORT = /from\s+["']@\/lib\/authority-forms\/signed-record-guard["']/;

/** Writers that must take their rule from the guard module. */
const GUARDED_WRITERS = [
  "app/api/authority-forms/[id]/route.ts",
  "app/api/authority-forms/[id]/signatures/route.ts",
  "app/api/authority-forms/sign/[token]/route.ts",
  "app/api/authority-forms/[id]/send-signature-request/route.ts",
];

/** Writers reviewed and left unguarded, each with its reason. */
const EXEMPT_WRITERS: Record<string, string> = {
  "app/api/reports/[id]/authority-forms/route.ts":
    "creates a new DRAFT form and its empty signature slots; nothing is signed yet",
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

// ---------------------------------------------------------------------------
// RA-8526 — cascade deleters, derived from the schema
//
// A delete of any model that cascades into AuthorityFormInstance erases signed
// forms without naming a form model, so the writer scan above cannot see it.
// The ancestors are read from prisma/schema.prisma (onDelete: Cascade, walked
// transitively), never typed by hand: a new cascade parent joins the scan the
// moment it is added to the schema.
// ---------------------------------------------------------------------------

/** child model -> parent models it cascades from (onDelete: Cascade). */
function cascadeParents(schema: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const m of schema.matchAll(modelRe)) {
    const child = m[1];
    for (const line of m[2].split("\n")) {
      const f = line.match(/^\s*\w+\s+(\w+)\??\s.*@relation\([^)]*onDelete:\s*Cascade/);
      if (!f) continue;
      if (!out.has(child)) out.set(child, new Set());
      out.get(child)!.add(f[1]);
    }
  }
  return out;
}

function cascadeAncestors(schema: string, target: string): string[] {
  const parents = cascadeParents(schema);
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    for (const p of parents.get(stack.pop()!) ?? []) {
      if (!seen.has(p)) {
        seen.add(p);
        stack.push(p);
      }
    }
  }
  return [...seen].sort();
}

const camel = (m: string) => m[0].toLowerCase() + m.slice(1);

/** Deleters of a cascade ancestor that must call the guard module. */
const GUARDED_CASCADE_DELETERS = [
  "app/api/reports/[id]/route.ts",
  "app/api/reports/bulk-delete/route.ts",
  "app/api/account/delete/route.ts",
];

describe("cascade deleters of a signed form (RA-8526)", () => {
  const schema = readFileSync(join(REPO_ROOT, "prisma", "schema.prisma"), "utf8");
  const ancestors = cascadeAncestors(schema, "AuthorityFormInstance");
  const deleteCall = new RegExp(
    `\\b(${ancestors.map(camel).join("|")})\\s*\\.\\s*(delete|deleteMany)\\s*\\(`,
  );
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
  const deleters = files
    .filter((f) => deleteCall.test(readFileSync(f, "utf8")))
    .map((f) => relative(REPO_ROOT, f).split(sep).join("/"))
    .sort();

  it("reads the cascade chain from the schema (positive control)", () => {
    expect(ancestors).toContain("Report");
    expect(ancestors).toContain("User");
    // Walks transitively and only follows Cascade.
    expect(
      cascadeAncestors(
        "model A {\n  b B @relation(fields: [bId], references: [id], onDelete: Cascade)\n}\n" +
          "model B {\n  c C @relation(fields: [cId], references: [id], onDelete: Cascade)\n  d D? @relation(fields: [dId], references: [id], onDelete: SetNull)\n}\n",
        "A",
      ),
    ).toEqual(["B", "C"]);
  });

  it("finds the known deleters (positive control: an empty scan fails)", () => {
    for (const f of GUARDED_CASCADE_DELETERS) expect(deleters).toContain(f);
  });

  it("every deleter of a cascade ancestor calls the guard module", () => {
    expect(
      deleters.filter((f) => !GUARDED_CASCADE_DELETERS.includes(f)),
      "New delete of a model that cascades into authority forms: call reportsHoldingSignedForms / assertNoSignedFormCascade from lib/authority-forms/signed-record-guard and add the file to GUARDED_CASCADE_DELETERS",
    ).toEqual([]);
    for (const f of GUARDED_CASCADE_DELETERS) {
      const src = readFileSync(join(REPO_ROOT, f), "utf8");
      expect(GUARD_IMPORT.test(src), `${f} must import the guard`).toBe(true);
      expect(
        /reportsHoldingSignedForms|assertNoSignedFormCascade/.test(src),
        `${f} must run the signed-form check before deleting`,
      ).toBe(true);
    }
  });
});

describe("database erasure switch (RA-8526 proposed migration)", () => {
  it("no application code or script sets the signed-form erasure setting", () => {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
    const setters = files.filter((f) =>
      readFileSync(f, "utf8").includes("allow_signed_form_erasure"),
    );
    expect(files.length).toBeGreaterThan(100);
    expect(setters).toEqual([]);
  });
});
