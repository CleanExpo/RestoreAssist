# Copyright output-filter (RA-7000)

Enforces that IICRC copyrighted standard text is used for **grounding** but never
**republished verbatim** in customer output, and never quoted in marketing.

- Module: `lib/standards/copyright-guard.ts`
- Tests: `lib/standards/__tests__/copyright-guard.test.ts`
- Status: **library only.** Wiring into the report / Margot / marketing surfaces
  is a later integration phase (see "Where it plugs in" and "Integration status").

> This is a **heuristic, not a legal guarantee.** It measures contiguous verbatim
> reproduction. It does not understand paraphrase, translation, summarisation, or
> fair use, and it does not replace legal review. It exists to stop the obvious
> redistribution-bypass failure mode — the model pasting copyrighted standard
> prose into a customer report or an advertisement.

## The model

IICRC standard text is copyrighted and legitimately available only via
IICRC/CARSI membership. Founder-confirmed policy:

1. **Store verbatim internally for grounding.** The full standard text lives only
   in the owner's private store (Wiki / Supabase), never in this repo. That
   boundary is enforced separately by `scripts/check-no-verbatim-standards.ts`
   (a canary tripwire) — this module is the complementary check on generated
   **output**.
2. **Customer output cites + applies in our own words.** A report may cite a
   clause (`S500:2021 §12.5`) and restate the requirement, but must not paste the
   copyrighted passage beyond incidental fair-use overlap.
3. **Marketing = zero verbatim.** Marketing may reference the framework and cite a
   clause number, but must never reproduce the standard's wording — not even a
   short lifted clause.
4. **RestoreAssist must not become a redistribution bypass.** Users who need the
   source text are directed to IICRC/CARSI membership.

This sits beside the existing anti-fabrication citation gate
(`lib/iicrc-inclusion-check.ts`, `scripts/check-standards-citations.ts`): that
gate stops *fabricated / stale* citations; this filter stops *verbatim copyright*
reproduction. They are orthogonal — a citation can be perfectly valid and still
carry an illegally-copied passage next to it.

## How detection works

Given the generated `text` and the `sourceChunks` it was grounded on, the guard
finds the **longest contiguous run of words reproduced verbatim from a source
chunk** — a longest-common-verbatim-span / n-gram-overlap approach.

1. Both output and source are tokenised into normalised words (lowercased
   alphanumeric tokens), so casing, punctuation, and whitespace differences do
   not defeat a match. Output tokens keep their character offsets so the exact
   offending span can be sliced from the original text.
2. A `SEED_LEN`-gram index over the source chunks locates candidate match starts
   in near-linear time; each seed is then extended left and right to its maximal
   run. Runs contained within a longer run are dropped, so each reproduced
   passage is reported once.
3. Each run reports its word length and its **source-coverage ratio** (what
   fraction of the source chunk it reproduces contiguously).

Only reproduction of the **provided source chunks** is flagged — the guard is
scoped to the text the output was actually grounded on, not to general English.

## Thresholds and rationale

All lengths are counted in **normalised words**. Defaults in
`DEFAULT_COPYRIGHT_GUARD_CONFIG`; every value is `config`-overridable.

| Constant | Default | Rationale |
|---|---|---|
| `SEED_LEN` (absolute detection floor) | 4 words | Runs shorter than this are never reported. Four consecutive words is already specific enough to be a deliberate copy rather than incidental overlap, and a 4-gram seed keeps the detector near-linear (a 1-gram seed would explode on stopwords). Configured thresholds below the floor are clamped up to it. |
| `reportMinRunWords` | 12 words | Report mode is a **fair-use-style** threshold. Short factual phrases and citations naturally overlap with the standards; a dozen consecutive words reproduced from copyrighted prose is reproduction, not incidental. Over this → flag + redact + require paraphrase. |
| `marketingMinRunWords` | 6 words | Marketing carries **near-zero tolerance**. Set low enough to catch a copied clause, but not 1–2 words — a trivial stopword sequence ("the water damage restoration industry") is not the copyrighted expression and would false-positive. |
| `maxChunkCoverageRatio` | 0.5 | Secondary trigger for **both** modes: if a single contiguous run reproduces ≥ half of the source chunk it came from, flag it regardless of absolute length. Catches a short-but-whole clause being lifted verbatim, which the word-count threshold alone would miss. |

These numbers are deliberately conservative starting points, not tuned against a
labelled corpus. They are the knobs to revisit once real report/marketing output
is flowing through the guard.

## Enforcement behaviour

`guardStandardOutput(text, sourceChunks, mode, config?)` → `CopyrightGuardResult`:

- **`report` mode:** a run breaches when `wordCount ≥ reportMinRunWords` **or**
  `coverageRatio ≥ maxChunkCoverageRatio`. Breaching spans are returned in
  `violations`, and `redactedText` replaces each with `REDACTION_PLACEHOLDER`.
  The **citation is left intact** — only the copyrighted prose is redacted, and
  the caller is instructed to paraphrase-and-cite.
- **`marketing` mode:** same detector, tighter threshold
  (`marketingMinRunWords`). **Any** qualifying verbatim span blocks. The caller
  should rewrite entirely, not ship the placeholder version.

The result also carries `detectedRuns` (every run at/above the floor, breaching
or not) and `longestRunWords` for diagnostics — useful for showing "closest
verbatim overlap" even on a passing check.

## Prompt-side guard

`COPYRIGHT_GROUNDING_INSTRUCTION` is a reusable snippet for the report / Margot
generation prompts: *ground on the provided standard text but express
requirements in your own words; cite the clause; never reproduce the standard's
wording verbatim; direct users to IICRC/CARSI membership for the source text.*
`appendCopyrightGroundingInstruction(prompt)` appends it idempotently.

The prompt-side instruction **reduces** violations; the output-side
`guardStandardOutput` check is the enforcement **backstop**. Use both — do not
rely on the prompt alone.

## Where it plugs in (integration phase — NOT wired yet)

1. **Report output post-check.** After
   `app/api/reports/generate-inspection-report/route.ts` generates a report, run
   `guardStandardOutput(reportText, sourceChunks, "report")` where `sourceChunks`
   are the standard passages fed into the prompt (via `lib/standards-retrieval.ts`
   / the knowledge-graph `expandContext` in `lib/knowledge/index.ts`). On a
   violation, store `redactedText` and surface the paraphrase-and-cite action.
2. **Prompt-side.** Fold `COPYRIGHT_GROUNDING_INSTRUCTION` into the report and
   Margot prompt builders (`buildStandardsContextPrompt` and the Margot system
   prompt) via `appendCopyrightGroundingInstruction`.
3. **Marketing lint.** Run `guardStandardOutput(copy, sourceChunks, "marketing")`
   over any marketing surface that touches standards content, as a hard gate
   before publish.

## Known limitations

- **Heuristic, not legal.** Contiguous-run matching only. It will miss verbatim
  reproduction that is lightly reworded, reordered, or translated, and it cannot
  judge fair use. It is not a substitute for legal review or licensing.
- **Scoped to provided source chunks.** It only detects reproduction of the
  chunks passed in. Text copied from a standard the output was *not* grounded on
  (or grounded on out-of-band) is invisible to it.
- **Thresholds are unvalidated defaults.** Tune against real output once the guard
  is wired into the surfaces above.
- **Normalisation trade-off.** Stripping punctuation/case makes matching robust
  but means the reported span boundaries are word-aligned to the original text,
  not necessarily clause-aligned.
