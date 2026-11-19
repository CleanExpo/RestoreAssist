/**
 * Chart palette (RA-8465): the one owner of chart colour in RestoreAssist.
 *
 * Every Recharts chart takes its colours from here. Each value is a CSS
 * variable declared in app/globals.css under `:root` (light) and `.dark`,
 * so the light and dark steps swap in CSS and no chart needs to know the
 * theme. Recharts passes these strings straight to SVG `stroke`, `fill` and
 * `stop-color`, which resolve `var()` like any other CSS value.
 *
 * Colour is assigned by the job it does (method: dataviz skill, validated
 * with its validate_palette.js against this app's card surfaces):
 *   - categorical: which series. Eight slots in a fixed order, built on
 *     palette A (slot 1 harbour blue, slot 2 burnt orange). Never cycled; a
 *     ninth series folds to neutral.
 *   - accent: a single-series chart uses slot 1.
 *   - status: good / info / warning / critical, only where a mark means a
 *     state (dry or wet, subscription health). Never used as "series 4".
 *   - neutral: "Other", archived, expired, and folded series.
 * Values, labels and legends stay in text tokens, never the series colour.
 * The palette and its contrast figures are documented in .claude/DESIGN.md.
 *
 * Do not add a hex, rgb() or hsl() literal to a chart file: the guard test
 * lib/charts/__tests__/chart-palette.test.ts fails on it.
 */

/** Categorical slots in fixed order. Assign in sequence; never skip or cycle. */
export const CHART_SERIES = [
  "var(--chart-1)", // harbour blue (palette A primary)
  "var(--chart-2)", // burnt orange (palette A brand-bronze)
  "var(--chart-3)", // aqua green
  "var(--chart-4)", // amber
  "var(--chart-5)", // magenta
  "var(--chart-6)", // green
  "var(--chart-7)", // violet
  "var(--chart-8)", // red
] as const;

/** Single-series charts: one series needs one colour, and the title names it. */
export const CHART_ACCENT = CHART_SERIES[0];

/** Folded series ("Other"), archived and expired states. */
export const CHART_NEUTRAL = "var(--chart-neutral)";

/** Reserved meanings. Pair with an icon or label; never colour alone. */
export const CHART_STATUS = {
  good: "var(--chart-good)",
  info: "var(--chart-info)",
  warning: "var(--chart-warning)",
  critical: "var(--chart-critical)",
} as const;

/** Grid, axes, reference lines and the tooltip surface. */
export const CHART_CHROME = {
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  /** Threshold lines: muted ink, not a series or status colour. */
  reference: "var(--chart-reference)",
  /** A model line drawn over the data (a target curve): full-strength ink. */
  ink: "var(--chart-ink)",
  /** Ring drawn around an active dot so it separates from the line. */
  surface: "var(--chart-surface)",
} as const;

/** Tooltip box style for Recharts `contentStyle`. */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--chart-surface)",
  border: "1px solid var(--chart-grid)",
  borderRadius: "8px",
  color: "var(--chart-ink)",
} as const;

/** Slot for the series at `index`; a ninth series and beyond fold to neutral. */
export function seriesColour(index: number): string {
  return CHART_SERIES[index] ?? CHART_NEUTRAL;
}

/**
 * Colour follows the entity, never its rank: give each key its slot from a
 * fixed order, so filtering one series out does not repaint the others.
 * Keys not in `order` fold to neutral.
 */
export function colourForKey(order: readonly string[], key: string): string {
  const index = order.indexOf(key);
  return index === -1 ? CHART_NEUTRAL : seriesColour(index);
}
