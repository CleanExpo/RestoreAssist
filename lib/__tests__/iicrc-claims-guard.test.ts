/**
 * RA-8297 — IICRC claims guard.
 *
 * docs/compliance/IICRC-STANDARDS-LICENSING.md §4 allows RestoreAssist to
 * CITE a standard (designation, edition, section number, short title — C1).
 * It does not allow the product to claim CONFORMITY ("IICRC compliant",
 * "S500:2021 compliant report") without naming the assessment that
 * established it (C6), or to imply the IICRC approves, certifies or partners
 * with RestoreAssist. AI persona prompts must not tell the model it holds an
 * IICRC certification either: the model is not a certified person, and the
 * persona leaks into customer-facing output.
 *
 * This guard reads every customer-facing text surface and fails on those
 * phrases. Citation wording ("cites IICRC S500:2021 §10.4.1",
 * "structured on S500:2021") does not match. A technician's own certification
 * ("IICRC certified technician", "IICRC certification number") does not
 * match either: it describes a person, not RestoreAssist.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");

/** Customer-facing surfaces, relative to the repository root. */
const SCAN_ROOTS = [
  "app",
  "components",
  "data/content",
  "public",
  "lib",
  "mobile/fastlane/metadata",
  "docs/marketing",
  "docs/youtube-scripts",
  "docs/distribution",
  "tools/remotion/compositions",
];

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".md",
  ".mdx",
  ".json",
  ".jsonl",
  ".txt",
  ".vtt",
  ".html",
  ".xml",
  ".yml",
  ".yaml",
]);

const SKIP_DIRS = new Set(["node_modules", "__tests__", ".next", "dist"]);

function isTestFile(name: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (
      st.isFile() &&
      TEXT_EXTENSIONS.has(extOf(name)) &&
      !isTestFile(name) &&
      st.size < 2_000_000
    ) {
      out.push(full);
    }
  }
}

/** Conformity and endorsement phrasing that C1 does not cover. */
const BANNED: ReadonlyArray<{ id: string; re: RegExp }> = [
  {
    id: "iicrc-compliant",
    re: /IICRC[\s-]*(S\d{3}(:\d{4})?[\s-]*)?(compliant|compliance report|certified (software|platform|reports?))/i,
  },
  { id: "standard-compliant", re: /\bS[1-7]\d0(:\d{4})?[\s-]+compliant/i },
  { id: "compliant-with-iicrc", re: /compliant with (ANSI\/)?(AS-)?IICRC/i },
  {
    id: "compliance-watertight",
    re: /(IICRC|S500)[^\n]{0,40}compliance (is )?watertight/i,
  },
  { id: "section-compliant", re: /§\s?\d+(\.\d+)*[\s-]+compliant/i },
  {
    id: "persona-certified",
    re: /You are an?\b[^\n.]{0,80}\bIICRC\b[^\n.]{0,60}certified/i,
  },
  {
    id: "persona-certified-prefix",
    re: /You are an?\s+(senior\s+)?certified\s+(ANSI\/)?IICRC/i,
  },
  { id: "iicrc-endorsement", re: /IICRC[- ](approved|endorsed|partner)/i },
  {
    // Promises of conformity in either word order: "IICRC S500:2021 compliance
    // guaranteed", "guaranteed S500 compliance", "verified IICRC compliant".
    id: "compliance-guarantee",
    re: /(guarantee[ds]?|assured|certified|verified)[^\n.]{0,30}(IICRC|S[1-7]\d0)[^\n.]{0,30}complian|(IICRC|S[1-7]\d0)[^\n.]{0,40}complian(t|ce)[^\n.]{0,15}(guaranteed|assured|certified|verified)/i,
  },
];

/**
 * Lines that match a pattern but are legitimate. Keep this small; every entry
 * needs a reason. Keyed by path, pattern id AND a fragment of the exact line,
 * so an exemption covers that one line and never the rest of the file. A test
 * below fails if an entry stops matching exactly one line (a stale exemption).
 */
const ALLOW: ReadonlyArray<{
  file: string;
  id: string;
  line: string;
  reason: string;
}> = [
  {
    file: "docs/marketing/pillar-c/icp-nz.md",
    id: "iicrc-endorsement",
    line: "an IICRC-approved facility with in-house instructors",
    reason:
      "Describes a third-party NZ training school's own IICRC approval as market research, not a RestoreAssist claim.",
  },
];

interface Hit {
  file: string;
  line: number;
  id: string;
  text: string;
}

function scan(): Hit[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
  const hits: Hit[] = [];
  for (const full of files) {
    const rel = relative(REPO_ROOT, full).split("\\").join("/");
    if (rel === "lib/__tests__/iicrc-claims-guard.test.ts") continue;
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((text, idx) => {
      for (const { id, re } of BANNED) {
        if (!re.test(text)) continue;
        if (
          ALLOW.some(
            (a) => a.file === rel && a.id === id && text.includes(a.line),
          )
        ) {
          continue;
        }
        hits.push({
          file: rel,
          line: idx + 1,
          id,
          text: text.trim().slice(0, 160),
        });
      }
    });
  }
  return hits;
}

describe("IICRC claims guard (RA-8297)", () => {
  it("scans a non-trivial set of files (positive control on the walker)", () => {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
    expect(files.length).toBeGreaterThan(500);
  });

  it("each allow-list entry exempts exactly one existing line", () => {
    for (const a of ALLOW) {
      const lines = readFileSync(join(REPO_ROOT, a.file), "utf8").split("\n");
      const matching = lines.filter((t) => t.includes(a.line));
      expect(matching, `${a.file}: ${a.line}`).toHaveLength(1);
    }
  });

  it("each banned pattern matches its intended phrase", () => {
    const samples: Record<string, string> = {
      "iicrc-compliant": "IICRC S500:2021 Compliant Inspection Report",
      "standard-compliant": "Log S500:2021-compliant moisture data",
      "compliant-with-iicrc": "Compliant with IICRC S500:2021",
      "compliance-watertight":
        "keeps your IICRC S500:2021 compliance watertight",
      "section-compliant": "Drying Goal: ACHIEVED — IICRC S500 §11.4 compliant",
      "persona-certified": "You are an IICRC S500:2021 certified specialist",
      "persona-certified-prefix":
        "You are a certified IICRC S500:2021 specialist",
      "iicrc-endorsement": "IICRC-approved software",
      "compliance-guarantee": "IICRC S500:2021 compliance guaranteed.",
    };
    for (const { id, re } of BANNED) {
      expect(re.test(samples[id]), id).toBe(true);
    }
    // Citation wording must stay allowed.
    const allowed = [
      "Inspection Report (cites ANSI/IICRC S500:2021)",
      "Cites IICRC S500:2021",
      "Reports are structured on S500:2021 sections",
      "IICRC certified technician",
      "You are an experienced water damage restoration assessor who cites IICRC standards by section number.",
    ];
    for (const text of allowed) {
      for (const { id, re } of BANNED) {
        expect(re.test(text), `${id} wrongly matched: ${text}`).toBe(false);
      }
    }
  });

  it("customer-facing text makes no IICRC conformity or endorsement claim", () => {
    const hits = scan();
    const report = hits
      .map((h) => `${h.file}:${h.line} [${h.id}] ${h.text}`)
      .join("\n");
    expect(hits, `\n${hits.length} IICRC claim(s):\n${report}\n`).toEqual([]);
  });
});
