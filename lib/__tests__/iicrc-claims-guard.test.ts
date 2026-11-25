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
    // Declarative conformity verbs (founder pass rule, 20/11/2026): "complies
    // with", "in compliance with", "conforms to", "in conformity with", "meets",
    // "adheres to" followed by an IICRC standard. Question forms such as "does
    // the output meet IICRC requirements?" are model rubrics and do not match.
    id: "conformity-verb",
    // Keyed on the conformity WORD, then an optional preposition and an
    // optional modifier, so "strict compliance with", "fully compliant to the"
    // and bare "compliance IICRC S500" match, while a feature name followed by
    // a verb ("Compliance Checklists cite IICRC") or a drying goal ("meets its
    // S500 dry standard") does not.
    re: /\b(compliant|compliance|complies|conforms?|conformity|conformance|meets|adheres)\s+((with|to|under)\s+)?((the|strict|strictly|full|fully|all|relevant|applicable)\s+)?(ANSI\/)?(AS-)?(IICRC|S[1-7]\d0)\b/i,
  },
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

// No allow-list, by design. Two review rounds found that every exemption shape
// (whole file, then one line fragment) also exempted a real claim placed next
// to it. Legitimate text is reworded so it does not match instead.

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

  it("each banned pattern matches its intended phrase", () => {
    const samples: Record<string, string> = {
      "iicrc-compliant": "IICRC S500:2021 Compliant Inspection Report",
      "standard-compliant": "Log S500:2021-compliant moisture data",
      "compliant-with-iicrc": "Compliant with IICRC S500:2021",
      "conformity-verb":
        "RestoreAssist produces reports in compliance with IICRC S500:2021.",
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
      "Compliance Checklists cite IICRC S500, S520, and Australian standards for every job.",
      "Daily moisture monitoring until every material meets its S500 dry standard.",
      "Does the output meet IICRC/Australian regulatory requirements?",
    ];
    for (const text of allowed) {
      for (const { id, re } of BANNED) {
        expect(re.test(text), `${id} wrongly matched: ${text}`).toBe(false);
      }
    }
  });

  it("blocks every phrasing in the founder's pass rule (fixed controls)", () => {
    // Independent of the BANNED samples above: each phrase here must be caught
    // by at least one pattern. Founder pass rule, 20/11/2026.
    const required = [
      "IICRC compliant",
      "S500:2021 compliant",
      "compliant with IICRC S500:2021",
      "compliance with IICRC S500:2021",
      "in compliance with IICRC S500:2021",
      "in strict compliance with IICRC S500 standards",
      "compliant IICRC S500:2021",
      "compliance IICRC S500:2021",
      "complies with IICRC S500",
      "conforms to ANSI/IICRC S500",
      "in conformity with IICRC S520",
      "meets IICRC S500",
      "adheres to the IICRC S500",
      "IICRC S500:2021 compliance guaranteed",
      "IICRC-approved software",
    ];
    for (const phrase of required) {
      expect(
        BANNED.some(({ re }) => re.test(phrase)),
        `not blocked: ${phrase}`,
      ).toBe(true);
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
