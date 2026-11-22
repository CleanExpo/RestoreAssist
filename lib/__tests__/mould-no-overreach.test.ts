/**
 * RA-8540 — mould AI and workflow text must not over-reach.
 *
 * Founder doctrine (mining-accommodation pilot, slice 1): software never
 * infers health safety, legal compliance or remediation clearance from
 * insufficient data. A cleaner records observations; when the cause is
 * unclear a qualified assessor (for example, an occupational hygienist)
 * assesses. So:
 *
 *   - AI may describe what was observed and suggest referral to a qualified
 *     assessor. It never assigns a mould condition or sets clearance.
 *   - Condition and clearance come only from a human assessor's entry.
 *   - IICRC S520 is named as an industry standard, never a regulation.
 *   - An area threshold is stated as a legal requirement only where a cited
 *     regulator source exists; none is cited, so none is stated.
 *   - A species is never named from visual evidence.
 *
 * Three layers, so a second instance of the same kind cannot slip through:
 *   1. Prompt builders: every mould-bearing scope prompt (single and every
 *      multi-claim route) carries the assessor-only rules and none of the
 *      assignment instructions. Every other claim type is checked for the
 *      assignment instructions too.
 *   2. Surface scanner: product source (lib, app, components) carries none of
 *      the over-reach phrasings. Each pattern has a positive control.
 *   3. Behaviour: an AI-produced mould category is not used as the report's
 *      category when no human value is recorded, and the mould quick-fill
 *      template does not pre-fill an assessor condition or a species.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getClaimTypePrompt,
  getMultiClaimPrompt,
  MOULD_ASSESSOR_ONLY_HEADING,
  type ClaimType,
} from "@/lib/ai/claim-type-prompts";
import { buildStructuredBasicReport } from "@/lib/reports/build-structured-report";
import { NIR_QUICK_FILL_TEMPLATES } from "@/lib/nir-quick-fill-templates";
import { WORKFLOW_TEMPLATES } from "@/lib/evidence/workflow-definitions";

// ─── 1. Prompt builders ─────────────────────────────────────────────────────

/** Instructions that tell the model to assign a condition or set clearance. */
const PROMPT_BANNED: ReadonlyArray<{ id: string; re: RegExp }> = [
  // "Condition 1/2/3 per S520" — asks the model to classify each room.
  { id: "assign-condition-per-room", re: /Condition\s*1\s*\/\s*2\s*\/\s*3/i },
  // "Condition 2: precautionary sheeting" / "- Condition 1: Normal fungal
  // ecology" — a definitions table the model applies to what it sees.
  { id: "condition-definition", re: /\bCondition\s*[123]\s*:/ },
  { id: "classify-condition", re: /\b(classify|assign|determine)\s+(a\s+)?Condition\s*[123]/i },
  { id: "creates-condition", re: /\bcreates?\s+Condition\s*[123]/i },
  // "Clearance criteria: Condition 1 restored" — the model sets clearance.
  { id: "clearance-criteria-condition", re: /Clearance criteri(a|on)\s*:\s*Condition/i },
  { id: "mandatory-for-condition", re: /mandatory for Condition/i },
  { id: "s520-mandates", re: /S520[^\n]{0,30}\bmandates?\b/i },
];

const ALL_CLAIM_TYPES: ClaimType[] = [
  "water_damage",
  "fire_smoke",
  "storm",
  "mould",
  "contents",
  "biohazard",
  "odour",
  "carpet",
  "hvac",
  "asbestos",
];

/** Every multi-claim route that carries mould, one per branch of the router. */
const MOULD_MULTI_COMBOS: string[][] = [
  ["water_damage", "mould"], // named water + mould prompt
  ["water_damage", "fire_smoke", "mould"], // routed to the water + fire prompt
  ["storm", "water_damage", "mould"], // routed to the storm + water prompt
  ["water_damage", "contents", "mould"], // routed to the water + contents prompt
  ["fire_smoke", "contents", "mould"], // routed to the fire + contents prompt
  ["fire_smoke", "mould"], // generic multi-claim prompt
  ["storm", "mould"],
];

/**
 * Allow-list, not deny-list: every prompt line that names "Condition 1/2/3"
 * must tie it to the recorded condition. A new phrasing that hands the model
 * a condition to apply fails here even if no banned pattern matches it.
 */
function unrecordedConditionLines(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => /\bCondition\s*[123]\b/.test(line))
    .filter((line) => !/\brecorded\b/i.test(line))
    .map((line) => line.trim().slice(0, 160));
}

function bannedHits(text: string): string[] {
  return PROMPT_BANNED.filter(({ re }) => re.test(text)).map(({ id, re }) => {
    const m = text.match(re);
    return `${id}: "${m?.[0]}"`;
  });
}

describe("RA-8540 mould prompts — the model never assigns condition or clearance", () => {
  it("each banned prompt pattern matches the phrase it exists to catch (positive control)", () => {
    const samples: Record<string, string> = {
      "assign-condition-per-room":
        "Room-by-room contamination condition (Condition 1/2/3 per S520 §4.2).",
      "condition-definition": "- Condition 3: Significant contamination (growth >1 m²)",
      "classify-condition": "classify Condition 2 mould risk and apply antimicrobial",
      "creates-condition": "creates Condition 2 mould risk",
      "clearance-criteria-condition": "Clearance criteria: Condition 1 restored. Cite §9.",
      "mandatory-for-condition": "Occupant exclusion is mandatory for Condition 2/3 contamination",
      "s520-mandates": "IICRC S520 §5.1 mandates this.",
    };
    for (const { id, re } of PROMPT_BANNED) {
      expect(re.test(samples[id]), id).toBe(true);
    }
  });

  it("the single mould prompt carries the assessor-only rules and no assignment instruction", () => {
    const prompt = getClaimTypePrompt("mould");
    expect(prompt).toContain(MOULD_ASSESSOR_ONLY_HEADING);
    expect(bannedHits(prompt)).toEqual([]);
    expect(unrecordedConditionLines(prompt)).toEqual([]);
  });

  it("the allow-list rejects a condition line that is not tied to the record (positive control)", () => {
    expect(
      unrecordedConditionLines(
        "Air scrubbers mandatory (Cat 2/3 water or Condition 3 mould).",
      ),
    ).toHaveLength(1);
    expect(
      unrecordedConditionLines(
        "Air scrubbers mandatory where the recorded mould condition is Condition 3.",
      ),
    ).toEqual([]);
  });

  it.each(MOULD_MULTI_COMBOS.map((c) => [c.join("+"), c] as const))(
    "multi-claim %s carries the assessor-only rules and no assignment instruction",
    (_label, combo) => {
      const prompt = getMultiClaimPrompt(combo);
      expect(prompt).toContain(MOULD_ASSESSOR_ONLY_HEADING);
      expect(bannedHits(prompt)).toEqual([]);
      expect(unrecordedConditionLines(prompt)).toEqual([]);
    },
  );

  it.each(ALL_CLAIM_TYPES)(
    "the %s prompt carries no condition or clearance assignment instruction",
    (claimType) => {
      const prompt = getClaimTypePrompt(claimType);
      expect(bannedHits(prompt)).toEqual([]);
      expect(unrecordedConditionLines(prompt)).toEqual([]);
    },
  );

  it("states 'none recorded' when no assessor condition is supplied", () => {
    const prompt = getClaimTypePrompt("mould");
    expect(prompt).toMatch(/Recorded mould condition for this job: none recorded/);
    expect(prompt).toMatch(/refer to a qualified assessor/i);
  });

  it("passes through only the recorded condition, attributed to the job's record", () => {
    const single = getClaimTypePrompt("mould", {
      recordedMouldCondition: "CONDITION_3",
    });
    expect(single).toMatch(
      /Recorded mould condition for this job: Condition 3, as recorded on this job's mould assessment form/,
    );
    const multi = getMultiClaimPrompt(["water_damage", "mould"], {
      recordedMouldCondition: "CONDITION_2",
    });
    expect(multi).toMatch(
      /Recorded mould condition for this job: Condition 2, as recorded on this job's mould assessment form/,
    );
  });

  it("forbids naming a species from visual evidence and calling S520 a regulation", () => {
    const prompt = getClaimTypePrompt("mould");
    expect(prompt).toMatch(/Never name a mould species or genus from visual evidence/);
    expect(prompt).toMatch(/IICRC S520 is an industry standard, not a regulation/);
    expect(prompt).toMatch(/never state that .*safe to occupy/i);
  });
});

// ─── 2. Surface scanner ─────────────────────────────────────────────────────

const REPO_ROOT = resolve(__dirname, "../..");
const SCAN_ROOTS = ["lib", "app", "components"];
const SKIP_DIRS = new Set(["node_modules", "__tests__", ".next", "dist"]);
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs)$/;

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
    if (st.isDirectory()) walk(full, out);
    else if (
      st.isFile() &&
      EXTENSIONS.test(name) &&
      !/\.(test|spec)\.[cm]?[jt]sx?$/.test(name) &&
      st.size < 2_000_000
    )
      out.push(full);
  }
}

/**
 * Over-reach phrasings in product copy. Instruction and claim phrasing only:
 * the bare words "Condition 3" stay allowed, because the assessor's own
 * dropdowns legitimately carry them.
 */
const SURFACE_BANNED: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: "standard-as-regulation", re: /(IICRC|S5\d0)[^\n]{0,60}regulatory pathway|regulatory pathway[^\n]{0,60}(IICRC|S5\d0)/i },
  { id: "licensed-remediation-required", re: /licensed remediation required/i },
  { id: "toxic-mould-species", re: /toxic mould species/i },
  { id: "species-identification-required", re: /species identification required/i },
  { id: "mould-area-threshold-required", re: /mould area\s*[>≥]\s*\d[^\n]{0,60}required/i },
  { id: "area-threshold-licensed", re: /area\s*>\s*\d+\s*(sqm|m²|m2)[^\n]{0,20}licen[cs]ed/i },
  { id: "map-visual-to-condition", re: /map visual observation to Condition/i },
  { id: "clearance-criteria-condition", re: /Clearance criteri(a|on)\s*:\s*Condition/i },
  { id: "classify-condition", re: /\bclassify\s+Condition\s*[123]/i },
  { id: "clearance-is-met", re: /clearance is met when/i },
  // Condition 1 as the clearance test, printed by software.
  { id: "condition-1-as-clearance", re: /returns? the area to Condition 1/i },
  // A condition printed for keyword-detected mould, as if assessed.
  { id: "printed-inferred-condition", re: /S520 Condition 3 \(active growth\)/i },
  // Provenance the code cannot prove: any assigned team member can write the form.
  { id: "assessor-provenance", re: /(entered|recorded) by the assessor/i },
  // RA-8541: a colloquial name invites naming a species from what is seen.
  { id: "black-mould-label", re: /\(Black Mould\)/i },
];

interface Hit {
  file: string;
  line: number;
  id: string;
  text: string;
}

function scanSurfaces(): { files: number; hits: Hit[] } {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
  const hits: Hit[] = [];
  for (const full of files) {
    const rel = relative(REPO_ROOT, full).split("\\").join("/");
    readFileSync(full, "utf8")
      .split("\n")
      .forEach((text, idx) => {
        for (const { id, re } of SURFACE_BANNED) {
          if (re.test(text))
            hits.push({ file: rel, line: idx + 1, id, text: text.trim().slice(0, 160) });
        }
      });
  }
  return { files: files.length, hits };
}

describe("RA-8540 mould product copy — no over-reach", () => {
  it("each surface pattern matches the phrase it exists to catch (positive control)", () => {
    const samples: Record<string, string> = {
      "standard-as-regulation":
        "IICRC S520:2024 §3 sets the regulatory pathway for remediation",
      "licensed-remediation-required": "Area > 10 sqm — licensed remediation required",
      "toxic-mould-species": "Toxic mould species identified (Stachybotrys) — full containment",
      "species-identification-required":
        "Critical: Mould species identification required for remediation protocol.",
      "mould-area-threshold-required":
        "Mould area > 3m²: specialist remediation protocol required.",
      "area-threshold-licensed": "Area > 10 sqm — licensed remediation required",
      "map-visual-to-condition": "Map visual observation to Condition 1/2/3.",
      "clearance-criteria-condition": "Clearance criteria: Condition 1 restored.",
      "classify-condition": "classify Condition 2 mould risk",
      "clearance-is-met": "clearance is met when the indoor mycoflora normalises",
      "condition-1-as-clearance":
        "Air movers MUST NOT run until post-remediation verification returns the area to Condition 1 (IICRC S520).",
      "printed-inferred-condition":
        "S520 Condition 3 (active growth): fit-tested RPE required (AS/NZS 1715)",
      "assessor-provenance": "Condition 3, as recorded by the assessor on this job.",
      "black-mould-label": '{ value: "STACHYBOTRYS", label: "Stachybotrys (Black Mould)" }',
    };
    for (const { id, re } of SURFACE_BANNED) {
      expect(re.test(samples[id]), id).toBe(true);
    }
    // Assessor dropdowns and observation wording stay allowed.
    const allowed = [
      '{ value: "CONDITION_3", label: "Condition 3 — Actual growth present" }',
      "Refer to a qualified assessor (for example, an occupational hygienist).",
      "IICRC S520 is an industry standard, not a regulation.",
      "Stachybotrys", // a laboratory result option, not a visual claim
    ];
    for (const text of allowed) {
      for (const { id, re } of SURFACE_BANNED) {
        expect(re.test(text), `${id} wrongly matched: ${text}`).toBe(false);
      }
    }
  });

  it("product source carries no mould over-reach phrasing", () => {
    const { files, hits } = scanSurfaces();
    // Positive control on the walker: a broken path must not read as clean.
    expect(files).toBeGreaterThan(1000);
    const report = hits.map((h) => `${h.file}:${h.line} [${h.id}] ${h.text}`).join("\n");
    expect(hits, `\n${hits.length} over-reach hit(s):\n${report}\n`).toEqual([]);
  });

  it("the mould workflow escalation triggers refer to an assessor and state no species or threshold", () => {
    const mould = WORKFLOW_TEMPLATES.MOULD;
    const text = JSON.stringify(mould);
    expect(text).not.toMatch(/Stachybotrys|toxic mould|black mould/i);
    expect(text).not.toMatch(/\b\d+\s*(sqm|m²|m2)/i);
    expect(mould.riskEscalationTriggers.join(" ")).toMatch(/qualified assessor/i);
  });
});

// ─── 3. Behaviour ───────────────────────────────────────────────────────────

describe("RA-8540 mould condition comes only from a human entry", () => {
  const build = (report: Record<string, unknown>, analysis: unknown) =>
    buildStructuredBasicReport({
      report: { id: "abcdef1234567890", ...report },
      analysis,
      stateInfo: null,
    } as Parameters<typeof buildStructuredBasicReport>[0]);

  it("does not adopt an AI analysis mould category when no human value is recorded", () => {
    const result = build({}, { biologicalMouldCategory: "CAT 3" });
    expect(result.hazards.biologicalMouldCategory).toBeNull();
  });

  it("keeps the human-recorded mould category", () => {
    const result = build(
      { biologicalMouldCategory: "CAT 2" },
      { biologicalMouldCategory: "CAT 3" },
    );
    expect(result.hazards.biologicalMouldCategory).toBe("CAT 2");
  });

  it("the mould quick-fill template does not pre-fill an assessor condition or a species", () => {
    const seed = NIR_QUICK_FILL_TEMPLATES["mould-remediation"].assessmentSeed;
    expect(seed).not.toHaveProperty("mouldConditionLevel");
    expect(seed).not.toHaveProperty("sporeType");
    // The observation fields stay, so the template still has content.
    expect(seed.visibleGrowthObserved).toBe(true);
  });
});
