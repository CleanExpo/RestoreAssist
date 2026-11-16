/**
 * RA-8395: the delete-confirm guard must fire on a planted one-click DELETE,
 * stay quiet on confirmed deletes and other methods, and refuse stale
 * allow-list entries.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { classify, scan } from "../check-delete-confirm.mjs";

const ONE_CLICK = `
async function remove(id) {
  await fetch("/api/things/" + id, { method: "DELETE" });
}`;
const CONFIRMED = `
import { useConfirmDialog } from "@/components/ConfirmDialog";
async function remove(id) {
  if (!(await confirm.ask({ title: "Delete?", destructive: true }))) return;
  await fetch("/api/things/" + id, { method: 'DELETE' });
}`;
const POST_ONLY = `fetch("/api/things", { method: "POST" });`;

function tree(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "ra8395-"));
  for (const [rel, text] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

describe("classify", () => {
  it("flags a DELETE with no confirm component", () => {
    expect(classify(ONE_CLICK)).toBe("unconfirmed");
  });
  it("accepts a DELETE behind the shared confirm", () => {
    expect(classify(CONFIRMED)).toBe("confirmed");
  });
  it("ignores other methods", () => {
    expect(classify(POST_ONLY)).toBe("no-delete");
  });
  it("does not accept a bare Modal or native confirm as a confirm step", () => {
    expect(classify(`// Modal\nwindow.confirm("x");\n${ONE_CLICK}`)).toBe("unconfirmed");
  });
});

describe("scan", () => {
  const root = tree({
    "app/dashboard/a/page.tsx": ONE_CLICK,
    "app/dashboard/b/page.tsx": CONFIRMED,
    "components/c.tsx": POST_ONLY,
    "app/api/things/route.ts": ONE_CLICK,
    "components/__tests__/d.test.tsx": ONE_CLICK,
    "components/e.test.tsx": ONE_CLICK,
  });

  it("fails only the unconfirmed client file, skipping API routes and tests", () => {
    const r = scan(root, new Map());
    expect(r.failures).toEqual(["app/dashboard/a/page.tsx"]);
    expect(r.deleteFiles).toBe(2);
    expect(r.stale).toEqual([]);
  });

  it("passes an allow-listed file", () => {
    const r = scan(root, new Map([["app/dashboard/a/page.tsx", "reviewed"]]));
    expect(r.failures).toEqual([]);
    expect(r.stale).toEqual([]);
  });

  it("reports allow-list entries that are confirmed, delete-free or missing", () => {
    const r = scan(
      root,
      new Map([
        ["app/dashboard/b/page.tsx", "x"],
        ["components/c.tsx", "x"],
        ["components/gone.tsx", "x"],
      ]),
    );
    expect(r.stale.map((s: { rel: string }) => s.rel).sort()).toEqual([
      "app/dashboard/b/page.tsx",
      "components/c.tsx",
      "components/gone.tsx",
    ]);
  });
});
