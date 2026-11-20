/**
 * Scanner for dark-only colour classes (RA-8305, RA-8383, RA-8307, RA-8368).
 *
 * Rule: a dark neutral background / border, or a light neutral text colour,
 * must carry a `dark:` variant. Write the light value plainly and the dark
 * value behind `dark:` (e.g. `bg-white dark:bg-slate-900`), or use a theme
 * token (`bg-background`, `bg-card`, `text-foreground`).
 *
 * Exemptions apply only inside the class string that earns them:
 * - a bare `dark` class makes that one string a dark island;
 * - `hover:text-white` is allowed only when the same string fills with a
 *   dark or saturated colour on hover (an outline button that turns solid).
 * Comments are removed before scanning, so a comment cannot carry an
 * exemption onto real code (RA-8307, RA-8368).
 *
 * Not checked (context-dependent, reviewed in the browser instead):
 * plain `text-white` and white-alpha fills, which are correct on coloured
 * buttons and dark islands.
 *
 * Pure string work, no file system access.
 */

const NEUTRAL = "(?:slate|gray|zinc|neutral|stone)";
const HUE =
  "(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|brand-harbour)";

export const DARK_ONLY = new RegExp(
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

/** A hover fill dark or saturated enough to carry white text. */
const SOLID_HOVER_FILL = new RegExp(
  `^hover:bg-(?:${HUE}-(?:500|600|700|800|900|950)|brand-(?:cta|navy|harbour|bronze|steel)|primary|destructive)(?:\\/\\d+)?$`,
);

/** Characters that separate class tokens. */
export const TOKEN_SPLIT = /[\s"'`{}(),]+/;

export interface Segment {
  /** 1-based line the segment starts on. */
  line: number;
  /** Text of the segment (a string literal's contents, or code between). */
  text: string;
  /** True for the contents of a string or template literal. */
  isString: boolean;
}

/**
 * Split source into string-literal contents and the code between them,
 * with comments removed. `'` and `"` strings end at the end of a line (JSX
 * text such as "Don't" must not swallow the next lines); template literals
 * may span lines.
 */
export function segments(source: string): Segment[] {
  const out: Segment[] = [];
  let quote: string | null = null;
  let blockComment = false;
  let buf = "";
  let bufLine = 1;
  let line = 1;

  const flush = (isString: boolean) => {
    if (buf) out.push({ line: bufLine, text: buf, isString });
    buf = "";
    bufLine = line;
  };

  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];

    if (blockComment) {
      if (c === "*" && next === "/") {
        blockComment = false;
        i++;
        bufLine = line;
      } else if (c === "\n") {
        line++;
        bufLine = line;
      }
      continue;
    }

    if (quote) {
      if (c === "\\") {
        buf += c + (next ?? "");
        i++;
        continue;
      }
      if (c === "\n") {
        if (quote === "`") {
          buf += c;
          line++;
          continue;
        }
        // An unterminated ' or " (JSX text) ends with the line.
        flush(true);
        quote = null;
        line++;
        bufLine = line;
        continue;
      }
      if (c === quote) {
        flush(true);
        quote = null;
        continue;
      }
      buf += c;
      continue;
    }

    if (c === "/" && next === "/") {
      // Line comment: skip to end of line.
      while (i < source.length && source[i] !== "\n") i++;
      i--;
      continue;
    }
    if (c === "/" && next === "*") {
      flush(false);
      blockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      flush(false);
      quote = c;
      bufLine = line;
      continue;
    }
    if (c === "\n") {
      flush(false);
      line++;
      bufLine = line;
      continue;
    }
    buf += c;
  }
  flush(quote !== null);
  return out;
}

/** Return `line:token` for every dark-only class with no `dark:` variant. */
export function findUnpairedDarkClasses(source: string): string[] {
  const hits: string[] = [];
  for (const seg of segments(source)) {
    const lines = seg.text.split("\n");
    const tokens = seg.text.split(TOKEN_SPLIT).filter(Boolean);
    // A bare `dark` class makes this one string a dark island by design,
    // e.g. the brand hero band. It never reaches another string.
    if (seg.isString && tokens.includes("dark")) continue;
    const solidHover = seg.isString && tokens.some((t) => SOLID_HOVER_FILL.test(t));

    lines.forEach((text, offset) => {
      for (const raw of text.split(TOKEN_SPLIT)) {
        if (!raw) continue;
        const parts = raw.split(":");
        const base = parts.pop() ?? "";
        if (parts.includes("dark")) continue;
        if (DARK_ONLY.test(base)) hits.push(`${seg.line + offset}:${raw}`);
        else if (base === "text-white" && parts.includes("hover") && !solidHover)
          hits.push(`${seg.line + offset}:${raw}`);
      }
    });
  }
  return hits;
}
