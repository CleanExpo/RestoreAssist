import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

// @ts-expect-error — plain .mjs helper, no type declarations.
import {
  collectTargets,
  findRoundTripMojibake,
  findVisibleMojibake,
  inspectBytes,
  main,
} from "../check-encoding.mjs";

const ROOT = process.cwd();
const GATE = join(ROOT, "scripts", "check-encoding.mjs");

/**
 * Ticket RA-7459 reproduce bytes:
 *   printf 'A dash \xc3\xa2\xe2\x82\xac\xe2\x80\x9d here\n'
 * Those are `â€”` (U+00E2 U+20AC U+201D) — CP1252-through-UTF-8 of an em dash.
 * Built from raw bytes so this file stays ASCII and cannot itself be mangled.
 */
const TICKET_PROBE = Buffer.from([
  0x41, 0x20, 0x64, 0x61, 0x73, 0x68, 0x20, 0xc3, 0xa2, 0xe2, 0x82, 0xac,
  0xe2, 0x80, 0x9d, 0x20, 0x68, 0x65, 0x72, 0x65, 0x0a,
]);

function utf8(parts: string): Buffer {
  return Buffer.from(parts, "utf8");
}

function runGate(cwd: string = ROOT): { code: number; output: string } {
  try {
    return {
      code: 0,
      output: execFileSync("node", [GATE], { encoding: "utf8", cwd }),
    };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("inspectBytes — fatal UTF-8 (RA-6938 class, must stay in place)", () => {
  it("rejects a byte that is not UTF-8", () => {
    const reasons = inspectBytes(Buffer.from([0x68, 0x69, 0xff, 0x20]));
    expect(reasons.join(" ")).toMatch(/invalid UTF-8/);
    expect(reasons.join(" ")).toMatch(/byte 2/);
  });

  it("still reports invalid UTF-8 even when a BOM is also present", () => {
    const reasons = inspectBytes(Buffer.from([0xef, 0xbb, 0xbf, 0xff]));
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/invalid UTF-8/);
  });
});

describe("inspectBytes — leading BOM", () => {
  it("rejects EF BB BF in front of otherwise clean ASCII", () => {
    const reasons = inspectBytes(Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69, 0x0a]));
    expect(reasons).toEqual(["leading UTF-8 byte-order mark"]);
  });

  it("does not treat a mid-file U+FEFF as a leading BOM", () => {
    const reasons = inspectBytes(utf8("hello \uFEFF world"));
    expect(reasons).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/byte-order mark/)]),
    );
  });
});

describe("inspectBytes — CP1252-through-UTF-8 mojibake", () => {
  it("rejects the ticket printf probe (em-dash as â€”)", () => {
    const reasons = inspectBytes(TICKET_PROBE);
    expect(reasons.join(" ")).toMatch(/mojibake/);
    expect(reasons.join(" ")).toMatch(/character 7/);
  });

  it("rejects Ã© (Ã + copyright) — round-trip of é", () => {
    // café double-encoded: é (C3 A9) read as CP1252 is Ã© (U+00C3 U+00A9).
    const reasons = inspectBytes(utf8("caf\u00C3\u00A9"));
    expect(reasons.join(" ")).toMatch(/mojibake/);
    expect(findRoundTripMojibake("caf\u00C3\u00A9")).toBe(3);
  });

  it("rejects Â« — round-trip of «", () => {
    const reasons = inspectBytes(utf8("quote \u00C2\u00AB here"));
    expect(reasons.join(" ")).toMatch(/mojibake/);
  });

  it("rejects Â + NBSP — round-trip of a non-breaking space", () => {
    const reasons = inspectBytes(utf8("end.\u00C2\u00A0Next"));
    expect(reasons.join(" ")).toMatch(/mojibake/);
  });

  it("rejects â€ followed by ASCII (visible signature; round-trip cannot see this)", () => {
    // â€ + space: E2 80 20 is not valid UTF-8, so round-trip stays quiet.
    const text = "A dash \u00E2\u20AC here";
    expect(findRoundTripMojibake(text)).toBeNull();
    expect(findVisibleMojibake(text)).not.toBeNull();
    expect(inspectBytes(utf8(text)).join(" ")).toMatch(/mojibake/);
  });

  it("rejects Â followed by ASCII punctuation (visible signature)", () => {
    const text = "Hello \u00C2, world";
    expect(findRoundTripMojibake(text)).toBeNull();
    expect(findVisibleMojibake(text)).not.toBeNull();
    expect(inspectBytes(utf8(text)).join(" ")).toMatch(/mojibake/);
  });

  it("rejects Ã followed by a full stop", () => {
    const text = "see \u00C3.";
    expect(inspectBytes(utf8(text)).join(" ")).toMatch(/mojibake/);
  });
});

describe("inspectBytes — false-positive arm: real French / Portuguese", () => {
  it("passes JOÃO (Portuguese Ã + letter)", () => {
    expect(inspectBytes(utf8("JO\u00C3O"))).toEqual([]);
  });

  it("passes CÂBLE (French Â + letter)", () => {
    expect(inspectBytes(utf8("C\u00C2BLE"))).toEqual([]);
  });

  it("passes Âge at a sentence start", () => {
    expect(inspectBytes(utf8("\u00C2ge du b\u00E2timent"))).toEqual([]);
  });

  it("passes a mixed French / Portuguese / German sentence", () => {
    const text =
      "caf\u00E9 na\u00EFve S\u00E3o Paulo \u00FCber JO\u00C3O et C\u00C2BLE";
    expect(inspectBytes(utf8(text))).toEqual([]);
    expect(findRoundTripMojibake(text)).toBeNull();
    expect(findVisibleMojibake(text)).toBeNull();
  });
});

describe("collectTargets — scope stays instruction files only", () => {
  it("returns only CLAUDE.md, AGENTS.md and .claude/rules/*.md", () => {
    const files = collectTargets(ROOT).map((p: string) =>
      relative(ROOT, p).split("\\").join("/"),
    );
    expect(files).toEqual(
      expect.arrayContaining([
        "CLAUDE.md",
        "AGENTS.md",
        ".claude/rules/review-dimensions.md",
        ".claude/rules/verification-gate.md",
      ]),
    );
    for (const f of files) {
      expect(
        f === "CLAUDE.md" ||
          f === "AGENTS.md" ||
          /^\.claude\/rules\/[^/]+\.md$/.test(f),
      ).toBe(true);
    }
    expect(files).not.toContain("tools/remotion/index.tsx");
    expect(files.some((f: string) => f.startsWith("tools/"))).toBe(false);
  });
});

describe("main() against a fixture tree", () => {
  it("names the probe file and exits 1", () => {
    const root = mkdtempSync(join(tmpdir(), "ra-7459-red-"));
    mkdirSync(join(root, ".claude", "rules"), { recursive: true });
    writeFileSync(join(root, "CLAUDE.md"), "# clean\n");
    writeFileSync(
      join(root, ".claude", "rules", "_mojibake-probe.md"),
      TICKET_PROBE,
    );
    expect(main(root)).toBe(1);
  });

  it("exits 0 on a clean instruction tree", () => {
    const root = mkdtempSync(join(tmpdir(), "ra-7459-green-"));
    mkdirSync(join(root, ".claude", "rules"), { recursive: true });
    writeFileSync(join(root, "CLAUDE.md"), "# clean brief\n");
    writeFileSync(join(root, "AGENTS.md"), "# clean agents\n");
    writeFileSync(
      join(root, ".claude", "rules", "ok.md"),
      "# rule\nUse JO\u00C3O and C\u00C2BLE in examples.\n",
    );
    expect(main(root)).toBe(0);
  });
});

describe("check:encoding against the live instruction tree", () => {
  it("stays green on the current CLAUDE.md / AGENTS.md / rules", () => {
    expect(existsSync(join(ROOT, "CLAUDE.md"))).toBe(true);
    const result = runGate();
    expect(result.output).toMatch(/OK/);
    expect(result.code).toBe(0);
  });
});
