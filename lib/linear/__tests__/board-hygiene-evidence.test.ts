import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BOARD_HYGIENE_EVIDENCE } from "../board-hygiene-evidence";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("board-hygiene-evidence (RA-7555)", () => {
  it("every registry entry has at least one check", () => {
    for (const entry of BOARD_HYGIENE_EVIDENCE) {
      expect(entry.checks.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("RA-7754 and RA-8094 evidence passes on this tree", () => {
    const ids = ["RA-7754", "RA-8094", "RA-7550", "RA-7555"];
    for (const id of ids) {
      const entry = BOARD_HYGIENE_EVIDENCE.find((e) => e.id === id);
      expect(entry, id).toBeDefined();
      for (const check of entry!.checks) {
        const full = path.join(repoRoot, check.path);
        expect(fs.existsSync(full), `${id}: ${check.path}`).toBe(true);
        if (check.kind === "grep") {
          const text = fs.readFileSync(full, "utf8");
          expect(new RegExp(check.pattern).test(text), check.pattern).toBe(true);
        }
      }
    }
  });
});
