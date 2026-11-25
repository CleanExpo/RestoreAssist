/**
 * RA-8110: the pure checks behind the report theme canary.
 *
 * Every function takes plain strings or numbers and returns findings. An empty
 * list means "looked and found nothing"; a check that cannot read its input
 * returns a finding instead, so "could not look" never reads as clean.
 * `__tests__/checks.test.ts` and `canary-faults.test.tsx` plant a fault in front of
 * each one and require it to fire. Both the unit tests and the Playwright spec
 * call these functions: there is one owner of each rule.
 */
import { STANDARDS_VERSIONS, standardCite, type StandardKey } from "../../nir-standards-mapping";

export type Finding ={ check: string; detail: string };

/* ---------------------------------------------------------------- money */

export function centsForms(cents: number): string[] {
  const dollars = cents / 100;
  const fixed = dollars.toFixed(2);
  const [whole, frac] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return [`$${grouped}.${frac}`, `${grouped}.${frac}`, fixed, String(cents)];
}

/**
 * A page a technician can open must carry no price. `markup` is the raw HTML
 * (so the server-sent component data is covered too); `text` is what a reader
 * sees. The sentinel is searched in both. A generic currency pattern is
 * searched in the visible text only, because the framework's own payload has
 * `$`-prefixed references that are not money.
 */
export function findMoneyLeaks(input: { markup: string; text: string }, sentinelCents: number): Finding[] {
  if (!input.markup || !input.text) return [{ check: "money", detail: "no page content to inspect" }];
  const findings: Finding[] = [];
  for (const form of centsForms(sentinelCents)) {
    if (input.markup.includes(form)) findings.push({ check: "money", detail: `sentinel price ${form} is in the page markup` });
    else if (input.text.includes(form)) findings.push({ check: "money", detail: `sentinel price ${form} is visible` });
  }
  const currency = input.text.match(/\$\s?\d|\b(?:AUD|NZD)\b/);
  if (currency) findings.push({ check: "money", detail: `currency text "${currency[0]}" is visible` });
  return findings;
}

/** The opposite control: a viewer who may see the price must see it, or the probe is blind. */
export function hasSentinelPrice(input: { markup: string; text: string }, sentinelCents: number): boolean {
  return centsForms(sentinelCents).some((form) => input.text.includes(form) || input.markup.includes(form));
}

/* ------------------------------------------------------------ citations */

// A standard named in text: bare, with a year, or with a section.
const STANDARD_MENTION = /\bS\d{3}[A-Z]?(?!\d)(?:\s*[:-]\s*\d{4})?(?:\s*§\s*\d[\d.]*)?/g;
const STANDARD_PARTS = /^(S\d{3}[A-Z]?)(?:\s*[:-]\s*(\d{4}))?(?:\s*§\s*(\d[\d.]*))?$/;

/**
 * Every standard named in `text` must be exactly what `standardCite()` (or the
 * registry's own designation) prints for it. The rule is not copied here: the
 * expected string is produced by calling the owner and compared whole.
 */
export function findUncitedStandards(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of text.matchAll(STANDARD_MENTION)) {
    const found = match[0].trim();
    const parts = found.match(STANDARD_PARTS);
    const key = parts?.[1] as StandardKey | undefined;
    const entry = key ? STANDARDS_VERSIONS[key] : undefined;
    const ok =
      !!parts && !!entry && !!key &&
      (found === standardCite(key, parts[3]) || found === entry.designation.replace(/^ANSI\/IICRC /, ""));
    if (!ok) findings.push({ check: "citation", detail: `"${found}" was not produced by standardCite()` });
  }
  return findings;
}

/* -------------------------------------------------------- reduced motion */

type Rule = { selector: string; body: string };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Split CSS into its top-level blocks: [prelude, body]. Nested braces stay in the body. */
function blocks(css: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let depth = 0;
  let start = 0;
  let prelude = "";
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) {
        prelude = css.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        out.push([prelude, css.slice(start, i)]);
        start = i + 1;
      }
    }
  }
  return out;
}

const REDUCED = /^@media[^{]*prefers-reduced-motion\s*:\s*reduce/i;

function collect(css: string, inReduced: boolean, motion: Rule[], calm: Rule[]): void {
  for (const [prelude, body] of blocks(css)) {
    if (/^@keyframes/i.test(prelude)) continue;
    if (prelude.startsWith("@")) {
      collect(body, inReduced || REDUCED.test(prelude), motion, calm);
      continue;
    }
    const decl = body.split(";").map((d) => d.trim());
    const animated = decl.some((d) => /^(animation|animation-name|transition|transition-property)\s*:/.test(d) && !/:\s*none\b/.test(d));
    const stilled = decl.some((d) => /^(animation|animation-name|transition|transition-property)\s*:\s*none\b/.test(d) || /^(animation|transition)-duration\s*:\s*0/.test(d));
    for (const selector of prelude.split(",").map((s) => s.trim())) {
      if (inReduced) { if (stilled) calm.push({ selector, body }); }
      else if (animated) motion.push({ selector, body });
    }
  }
}

/**
 * Every selector that animates or transitions must be switched off inside a
 * `prefers-reduced-motion: reduce` block. Themes are CSS variants, so one pass
 * over the stylesheet covers every theme that uses the selector.
 */
export function findUnguardedMotion(css: string): Finding[] {
  const motion: Rule[] = [];
  const calm: Rule[] = [];
  collect(stripComments(css), false, motion, calm);
  const stilled = new Set(calm.map((r) => r.selector));
  return motion
    .filter((r) => !stilled.has(r.selector))
    .map((r) => ({ check: "reduced-motion", detail: `${r.selector} animates with no prefers-reduced-motion branch` }));
}

/* ------------------------------------------------------------------ print */

export function parseRgb(value: string): [number, number, number] | null {
  const m = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Print must be a light page with dark ink, whatever the on-screen theme is. */
export function findPrintProblems(input: { background: string; ink: string }): Finding[] {
  const bg = parseRgb(input.background);
  const ink = parseRgb(input.ink);
  if (!bg || !ink) return [{ check: "print", detail: `could not read print colours (${input.background} / ${input.ink})` }];
  const findings: Finding[] = [];
  if (luminance(bg) < 0.85) findings.push({ check: "print", detail: `print background is not light (${input.background})` });
  const ratio = contrastRatio(bg, ink);
  if (ratio < 7) findings.push({ check: "print", detail: `print text contrast is ${ratio.toFixed(1)}:1, below 7:1` });
  return findings;
}

/* ---------------------------------------------------------------- layout */

export function findOverflow(input: { scrollWidth: number; clientWidth: number }): Finding[] {
  if (!input.clientWidth) return [{ check: "overflow", detail: "page has no measurable width" }];
  return input.scrollWidth > input.clientWidth
    ? [{ check: "overflow", detail: `page is ${input.scrollWidth}px wide in a ${input.clientWidth}px window` }]
    : [];
}

/* -------------------------------------------------------------------- axe */

type AxeResult = { violations?: Array<{ id: string; impact?: string | null; nodes?: Array<{ target?: unknown[] }> }> };

/** serious and critical axe violations fail. A missing result is a failure, never a pass. */
export function findAxeViolations(results: AxeResult | null | undefined): Finding[] {
  if (!results || !Array.isArray(results.violations)) return [{ check: "axe", detail: "axe returned no result" }];
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      check: "axe",
      detail: `${v.id} (${v.impact}) on ${(v.nodes ?? []).slice(0, 3).map((n) => String(n.target?.[0] ?? "?")).join(", ")}`,
    }));
}
