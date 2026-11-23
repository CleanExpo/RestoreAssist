/**
 * RA-8603 design guard: one owner for upload checks.
 *
 * Every route under app/api that parses a multipart body is found by
 * discovery (never from a hand-kept list of routes) and must import a shared
 * upload module. The floor-plan route was missed because each route carried
 * its own hand-written copy of the checks; this test makes a new route with no
 * shared check fail CI instead.
 *
 * The exemption list may only shrink: an entry that no longer exists, no
 * longer parses multipart, or now imports a shared module fails the test so
 * the entry is removed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const API_ROOT = join(REPO_ROOT, "app", "api");

/** Shared upload owners. Importing one of these satisfies the guard. */
const SHARED_UPLOAD_MODULES = [
  "@/lib/media/validate-image-upload",
  "@/lib/media/decode-check",
  "@/lib/media/bounded-body",
];

/**
 * Routes that still carry their own checks. Each has a hand-written size cap
 * (or is not a file upload) as of RA-8603; moving them to a shared module is
 * follow-up work. Do not add to this list: call a shared module instead.
 */
const EXEMPT: Record<string, string> = {
  // Form-encoded unsubscribe link, not a file upload.
  "app/api/pulse/unsubscribe/route.ts": "not a file upload",
  // Hand-written 10 MB audio cap.
  "app/api/ai/voice-note-transcribe/route.ts": "own audio size cap",
  // Hand-written 50 MB per-file cap and 20-file limit.
  "app/api/inspections/[id]/evidence/batch/route.ts": "own evidence size cap",
  // Hand-written 20 MB photo / 100 MB video cap.
  "app/api/inspections/[id]/evidence/route.ts": "own evidence size cap",
  // Hand-written 20 MB photo cap.
  "app/api/inspections/[id]/photos/route.ts": "own photo size cap",
  // Hand-written 50 MB PDF cap.
  "app/api/reports/upload/route.ts": "own PDF size cap",
  // Hand-written logo size cap and signature check.
  "app/api/upload/logo/route.ts": "own logo size cap",
};

const MULTIPART = /\.formData\s*\(|formDataFromBytes\s*\(/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" || name === "node_modules" ? [] : walk(full);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [full]
      : [];
  });
}

function repoPath(file: string): string {
  return relative(REPO_ROOT, file).split(sep).join("/");
}

function importsSharedModule(source: string): boolean {
  return SHARED_UPLOAD_MODULES.some((mod) => source.includes(`"${mod}"`));
}

const multipartRoutes = walk(API_ROOT)
  .map((file) => ({ path: repoPath(file), source: readFileSync(file, "utf8") }))
  .filter((route) => MULTIPART.test(route.source));

describe("multipart upload routes use a shared upload check (RA-8603)", () => {
  it("discovers the known upload routes (positive control)", () => {
    const paths = multipartRoutes.map((r) => r.path);
    expect(paths).toContain("app/api/inspections/[id]/floor-plan/route.ts");
    expect(paths).toContain("app/api/upload/route.ts");
    expect(paths.length).toBeGreaterThanOrEqual(10);
  });

  it("every multipart route imports a shared upload module or is exempt", () => {
    const offenders = multipartRoutes
      .filter((r) => !(r.path in EXEMPT) && !importsSharedModule(r.source))
      .map((r) => r.path);
    expect(
      offenders,
      `These routes parse a multipart body without a shared upload check. ` +
        `Import one of ${SHARED_UPLOAD_MODULES.join(", ")}.`,
    ).toEqual([]);
  });

  it("the exemption list only holds routes that still need it", () => {
    const byPath = new Map(multipartRoutes.map((r) => [r.path, r]));
    const stale = Object.keys(EXEMPT).filter((path) => {
      const route = byPath.get(path);
      return !route || importsSharedModule(route.source);
    });
    expect(stale, "Remove these entries from EXEMPT").toEqual([]);
  });
});
