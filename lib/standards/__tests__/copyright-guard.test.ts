import { describe, expect, it } from "vitest";
import {
  guardStandardOutput,
  appendCopyrightGroundingInstruction,
  COPYRIGHT_GROUNDING_INSTRUCTION,
  REDACTION_PLACEHOLDER,
  SEED_LEN,
} from "../copyright-guard";

/**
 * Synthetic "standard" prose. We deliberately do NOT use real IICRC text here —
 * this repo must never carry verbatim copyrighted standard text (enforced by
 * scripts/check-no-verbatim-standards.ts). The detector is text-agnostic, so a
 * plausible fabricated passage exercises it identically.
 */
const SOURCE_CHUNK =
  "The restoration technician shall verify that all affected structural materials have reached the established drying goal before any containment barriers are removed from the affected area.";

const SOURCE_CHUNKS = [SOURCE_CHUNK];

describe("guardStandardOutput — report mode (fair-use threshold)", () => {
  it("catches a contiguous verbatim run over the report threshold", () => {
    const output =
      "Per the standard, the restoration technician shall verify that all affected structural materials have reached the established drying goal before demobilising.";
    const result = guardStandardOutput(output, SOURCE_CHUNKS, "report");

    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.longestRunWords).toBeGreaterThanOrEqual(12);
    // The flagged span is the reproduced prose, sliced from the ORIGINAL output.
    expect(result.violations[0].text).toContain(
      "the restoration technician shall verify",
    );
    // Redacted draft swaps the prose for the paraphrase placeholder.
    expect(result.redactedText).toContain(REDACTION_PLACEHOLDER);
    expect(result.redactedText).not.toContain(
      "reached the established drying goal before",
    );
  });

  it("passes a paraphrased-but-cited answer", () => {
    const output =
      "Under S500:2021 §12.5, confirm affected materials meet the drying target before you take down containment.";
    const result = guardStandardOutput(output, SOURCE_CHUNKS, "report");

    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    // The citation stays; nothing is redacted.
    expect(result.redactedText).toBe(output);
  });

  it("does not flag a short incidental overlap below the report threshold", () => {
    const output =
      "The restoration technician documented the moisture readings on site.";
    const result = guardStandardOutput(output, SOURCE_CHUNKS, "report");

    // "the restoration technician" is only ~3-6 words of overlap — under 12.
    expect(result.ok).toBe(true);
  });
});

describe("guardStandardOutput — marketing mode (zero verbatim tolerance)", () => {
  it("blocks even a short verbatim span that report mode would tolerate", () => {
    const output =
      "We make sure all affected structural materials have reached the drying goal, fast.";
    // "affected structural materials have reached the" — a short lifted run.
    const reportResult = guardStandardOutput(output, SOURCE_CHUNKS, "report");
    const marketingResult = guardStandardOutput(output, SOURCE_CHUNKS, "marketing");

    expect(reportResult.ok).toBe(true); // under the 12-word report threshold
    expect(marketingResult.ok).toBe(false); // blocked at the 6-word marketing threshold
    expect(marketingResult.guidance).toMatch(/zero verbatim tolerance/i);
  });

  it("passes a citation-only reference with no copyrighted prose", () => {
    const output =
      "Our reports align with the IICRC S500:2021 water damage framework — ask about our CARSI-backed process.";
    const marketingResult = guardStandardOutput(output, SOURCE_CHUNKS, "marketing");
    const reportResult = guardStandardOutput(output, SOURCE_CHUNKS, "report");

    expect(marketingResult.ok).toBe(true);
    expect(reportResult.ok).toBe(true);
  });
});

describe("guardStandardOutput — coverage + edge cases", () => {
  it("flags a short-but-whole clause via the coverage ratio trigger", () => {
    const shortChunk = ["Verify the drying goal was achieved"]; // 6 words
    const output = "We always verify the drying goal was achieved on every job.";
    const result = guardStandardOutput(output, shortChunk, "report");

    // 6-word run is under the 12-word report threshold, but it reproduces the
    // ENTIRE source chunk — the coverage trigger flags it.
    expect(result.ok).toBe(false);
    expect(result.violations[0].sourceCoverageRatio).toBeGreaterThanOrEqual(0.5);
  });

  it("returns ok with no runs when there are no source chunks", () => {
    const result = guardStandardOutput("Any text at all here.", [], "report");
    expect(result.ok).toBe(true);
    expect(result.detectedRuns).toHaveLength(0);
    expect(result.longestRunWords).toBe(0);
  });

  it("ignores source chunks shorter than the detection floor", () => {
    const result = guardStandardOutput(
      "one two three",
      ["one two"],
      "marketing",
    );
    expect(result.ok).toBe(true);
    expect(SEED_LEN).toBe(4);
  });

  it("reports diagnostic runs even when the check passes", () => {
    const output =
      "The restoration technician shall verify readings only.";
    const result = guardStandardOutput(output, SOURCE_CHUNKS, "report");
    // A sub-threshold run is still surfaced for visibility.
    expect(result.ok).toBe(true);
    expect(result.detectedRuns.length).toBeGreaterThan(0);
    expect(result.longestRunWords).toBeGreaterThanOrEqual(SEED_LEN);
  });
});

describe("prompt-side grounding instruction", () => {
  it("mentions grounding, own-words, citation, and IICRC/CARSI membership", () => {
    expect(COPYRIGHT_GROUNDING_INSTRUCTION).toMatch(/own words/i);
    expect(COPYRIGHT_GROUNDING_INSTRUCTION).toMatch(/verbatim/i);
    expect(COPYRIGHT_GROUNDING_INSTRUCTION).toMatch(/IICRC\/CARSI membership/i);
  });

  it("appends the instruction and is idempotent", () => {
    const base = "Generate the inspection report.";
    const once = appendCopyrightGroundingInstruction(base);
    const twice = appendCopyrightGroundingInstruction(once);

    expect(once).toContain(COPYRIGHT_GROUNDING_INSTRUCTION);
    expect(once).toContain(base);
    expect(twice).toBe(once); // no double-append
  });
});
