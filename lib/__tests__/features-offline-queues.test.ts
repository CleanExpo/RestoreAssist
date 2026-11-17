/**
 * RA-8434 — the Features page may only advertise an offline queue that a
 * screen actually writes to.
 *
 * The page once claimed five queues. One of them had a module on disk but no
 * caller, and a proof-file comment on the page could not notice. This test
 * reads the same constant the page renders (lib/marketing/offline-queues.ts)
 * and, for every entry, requires:
 *   - the queue module exists and exports its writer;
 *   - at least one non-test file under app/ or components/ imports that writer
 *     from that module (static `import { … } from` or
 *     `const { … } = await import(…)`).
 * It also proves the page builds its count and list from the constant, so the
 * number word cannot drift from the list.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OFFLINE_QUEUES,
  offlineQueuesHeadline,
  offlineQueuesList,
} from "@/lib/marketing/offline-queues";

const ROOT = join(__dirname, "..", "..");
const CALLER_ROOTS = ["app", "components"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__mocks__"]);
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
const TEST_FILE = /\.(test|spec)\.[a-z]+$/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (SOURCE.test(name) && !TEST_FILE.test(name)) {
      out.push(full);
    }
  }
}

const callerFiles: { path: string; text: string }[] = [];
for (const root of CALLER_ROOTS) {
  const found: string[] = [];
  walk(join(ROOT, root), found);
  for (const path of found) {
    callerFiles.push({ path, text: readFileSync(path, "utf8") });
  }
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches `{ … writer … } from "spec"` and `{ … writer … } = await import("spec")`. */
function importPattern(writer: string, file: string): RegExp {
  const spec = `@/${file.replace(/\.(ts|tsx)$/, "")}`;
  return new RegExp(
    `\\{[^}]*\\b${escape(writer)}\\b[^}]*\\}\\s*(?:from\\s*|=\\s*await\\s+import\\(\\s*)["']${escape(spec)}["']`,
  );
}

describe("RA-8434 Features page offline-queue claims", () => {
  it("walked a real source tree (the search cannot pass on nothing)", () => {
    expect(callerFiles.length).toBeGreaterThan(500);
  });

  it("lists at least one queue and no duplicate files", () => {
    expect(OFFLINE_QUEUES.length).toBeGreaterThan(0);
    const files = OFFLINE_QUEUES.map((q) => q.file);
    expect(new Set(files).size).toBe(files.length);
  });

  for (const queue of OFFLINE_QUEUES) {
    describe(queue.file, () => {
      it(`exists and exports ${queue.writer}`, () => {
        const abs = join(ROOT, queue.file);
        expect(existsSync(abs), `${queue.file} is missing`).toBe(true);
        const text = readFileSync(abs, "utf8");
        expect(text).toMatch(
          new RegExp(
            `export\\s+(?:async\\s+)?function\\s+${escape(queue.writer)}\\b`,
          ),
        );
      });

      it(`has a non-test caller in app/ or components/ that imports ${queue.writer}`, () => {
        const pattern = importPattern(queue.writer, queue.file);
        const callers = callerFiles
          .filter((f) => pattern.test(f.text))
          .map((f) => f.path.slice(ROOT.length + 1));
        expect(
          callers,
          `${queue.writer} from ${queue.file} has no caller, so the Features page must not advertise "${queue.label}"`,
        ).not.toEqual([]);
      });
    });
  }

  it("states the number of queues as the word for OFFLINE_QUEUES.length", () => {
    // Independent oracle: not the module's own table.
    const words: Record<number, string> = {
      1: "One",
      2: "Two",
      3: "Three",
      4: "Four",
      5: "Five",
      6: "Six",
      7: "Seven",
      8: "Eight",
    };
    expect(offlineQueuesHeadline()).toBe(
      `${words[OFFLINE_QUEUES.length]} separate offline queues`,
    );
    for (const queue of OFFLINE_QUEUES) {
      expect(offlineQueuesList().toLowerCase()).toContain(queue.label);
    }
  });

  it("the Features page renders the count and list from the constant, not typed copy", () => {
    const page = readFileSync(join(ROOT, "app/features/page.tsx"), "utf8");
    expect(page).toMatch(
      /import\s*\{[^}]*\bofflineQueuesHeadline\b[^}]*\}\s*from\s*["']@\/lib\/marketing\/offline-queues["']/,
    );
    expect(page).toContain("offlineQueuesHeadline()");
    expect(page).toContain("offlineQueuesList()");
    // No hand-typed count left beside the derived one.
    expect(page).not.toMatch(/["'`][A-Za-z]+ separate offline queues/);
  });
});
