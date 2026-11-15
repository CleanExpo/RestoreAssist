/**
 * Scanner for dark-only colour classes (RA-8305, RA-8383).
 *
 * Rule: a dark neutral background / border, or a light neutral text colour,
 * must carry a `dark:` variant. Write the light value plainly and the dark
 * value behind `dark:` (e.g. `bg-white dark:bg-slate-900`), or use a theme
 * token (`bg-background`, `bg-card`, `text-foreground`).
 *
 * Not checked (context-dependent, reviewed by screenshot instead):
 * `text-white` and white-alpha fills, which are correct on coloured buttons.
 *
 * Pure string work, no file system access.
 */

const NEUTRAL = "(?:slate|gray|zinc|neutral|stone)";
const HUE =
  "(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const DARK_ONLY = new RegExp(
  [
    `^(?:bg|from|via|to)-${NEUTRAL}-(?:700|800|900|950)(?:\\/\\d+)?$`,
    `^(?:border|divide|ring)-${NEUTRAL}-(?:700|800|900|950)(?:\\/\\d+)?$`,
    `^text-${NEUTRAL}-(?:50|100|200|300|400)(?:\\/\\d+)?$`,
    `^(?:bg|from|via|to)-${HUE}-(?:900|950)(?:\\/\\d+)?$`,
    `^text-${HUE}-(?:100|200|300|400)(?:\\/\\d+)?$`,
    "^bg-black$",
    "^bg-brand-(?:deep|ink|surface|surface-2|abyss|canvas)(?:\\/\\d+)?$",
    "^(?:bg|from|via|to)-\\[#[0-2][0-9a-fA-F]{5}\\]$",
  ].join("|"),
);

const DARK_ISLAND = /["'`]dark\s/;

// A hover that turns neutral text white vanishes on a light surface. It is
// only right when the same element also fills with a colour on hover (an
// outline button that becomes solid).
const HOVER_FILL = new RegExp(`(?:^|[\\s"'\`])hover:bg-(?:${HUE}|brand)-`);

/** Return `line:token` for every dark-only class with no `dark:` variant. */
export function findUnpairedDarkClasses(source: string): string[] {
  const hits: string[] = [];
  source.split("\n").forEach((line, i) => {
    // A class string that starts a dark island (a bare `dark` class) is dark
    // in both themes by design, e.g. the brand hero band.
    if (DARK_ISLAND.test(line)) return;
    for (const raw of line.split(/[\s"'`{}(),]+/)) {
      const parts = raw.split(":");
      const base = parts.pop() ?? "";
      if (parts.includes("dark")) continue;
      if (DARK_ONLY.test(base)) hits.push(`${i + 1}:${raw}`);
      else if (
        base === "text-white" &&
        parts.includes("hover") &&
        !HOVER_FILL.test(line)
      )
        hits.push(`${i + 1}:${raw}`);
    }
  });
  return hits;
}
