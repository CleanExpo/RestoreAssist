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
 * Pure source work, no file system access. The same-tone check parses with
 * the TypeScript compiler API (a dev dependency); this module is imported by
 * tests only, never by app code.
 */

import ts from "typescript";

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

const LIGHT_TONE = new RegExp(
  `^(?:white|brand-(?:cream|mist)|${NEUTRAL}-(?:50|100|200))$`,
);
const DARK_TONE = new RegExp(
  `^(?:black|brand-navy|${NEUTRAL}-(?:800|900|950))$`,
);
const tone = (colour: string) =>
  LIGHT_TONE.test(colour) ? "light" : DARK_TONE.test(colour) ? "dark" : null;

/** `text-*` utilities that set size, alignment or wrapping, not colour. */
const TEXT_NOT_COLOUR =
  /^(?:xs|sm|base|lg|xl|\d+xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|\[(?:\d|length:|size:).*)$/;
/** `bg-*` utilities that set image, position, size or repeat, not a fill. */
const BG_NOT_FILL =
  /^(?:none|fixed|local|scroll|auto|cover|contain|center|top|bottom|left|right|left-top|left-bottom|right-top|right-bottom|repeat(?:-.*)?|no-repeat|clip-.*|origin-.*|blend-.*|gradient-.*|linear-.*|radial(?:-.*)?|conic(?:-.*)?|position-.*|size-.*|\[url.*)$/;

/** Plain (no variant), opaque colour classes only. */
const fillOf = (t: string) => {
  const m = /^bg-([^/:]+)$/.exec(t);
  return m && !BG_NOT_FILL.test(m[1]) ? m[1] : null;
};
const textOf = (t: string) => {
  const m = /^text-([^/:]+)$/.exec(t);
  return m && !TEXT_NOT_COLOUR.test(m[1]) ? m[1] : null;
};

/** Most class combinations one template may expand to before it is unjudged. */
export const MAX_COMBINATIONS = 256;

interface Tok {
  text: string;
  line: number;
  /** True when the token came from inside a ${...} (it replaces static ones). */
  dynamic: boolean;
}
/** One way an expression can render: the class tokens it yields. */
type Alt = Tok[];
/** Every way an expression can render, or why it cannot be listed. */
type Alts = { alts: Alt[] } | { opaque: ts.Node; reason: string };

/**
 * Return a finding for every class string whose light-mode text and solid
 * light-mode fill are both light or both dark (RA-8383 slice 1b: a pairing
 * codemod relit a dark pill to bg-white and left text-white on it), and for
 * every template literal whose combinations cannot be judged (RA-8487).
 *
 * - `line:text-X on bg-Y` — a same-tone pair.
 * - `line:cannot judge ${expr} with <classes>` — a template whose static
 *   classes set a toned fill or text colour, and an interpolation the scanner
 *   cannot list as class strings (a call, a prop, a non-const binding).
 *   It no longer passes silently: resolve it (a const, a ternary of literals,
 *   a const lookup table) or move the colour pair out of the template.
 *
 * Only plain classes count (no variant prefix); a translucent fill (`/N`)
 * shows what is behind it, so it is not a fill here. A bare `dark` island is
 * dark in both themes by design and is skipped. Size, alignment and image
 * utilities (`text-sm`, `bg-cover`) are not colours.
 *
 * Parsed with the TypeScript AST (RA-8487). A template literal is expanded
 * into every combination of its interpolations: a ternary yields both
 * branches, `a && "x"` yields "x" or nothing, a same-file `const` string or
 * a const lookup table (`TONES[k]`, `TONES.k`) yields its values, and nested
 * templates expand in place. Every combination is judged; classes from
 * separate ${...} blocks combine. Within one combination, a fill or text
 * colour from inside ${...} replaces the static one (the branch is the
 * override). A template with more than MAX_COMBINATIONS combinations is
 * reported as unjudged rather than skipped.
 */
export function findSameToneTextOnFill(source: string): string[] {
  const sf = ts.createSourceFile(
    "scan.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const hits: string[] = [];
  const add = (hit: string) => {
    if (!hits.includes(hit)) hits.push(hit);
  };
  const lineAt = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  // Same-file `const` bindings, for resolving identifiers and lookup tables.
  const consts = new Map<string, ts.Expression>();
  const collect = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      node.parent.flags & ts.NodeFlags.Const
    ) {
      consts.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  /** Tokens of literal text, with the line each one sits on. */
  const tokensOf = (raw: string, start: number, dynamic: boolean): Tok[] => {
    const out: Tok[] = [];
    let line = lineAt(start);
    for (const piece of raw.split(/(\n)/)) {
      if (piece === "\n") {
        line++;
        continue;
      }
      for (const t of piece.split(TOKEN_SPLIT)) {
        if (t) out.push({ text: t, line, dynamic });
      }
    }
    return out;
  };
  /** Start of a literal's text, past its opening quote or brace. */
  const textStart = (node: ts.Node) => node.getStart(sf) + 1;

  const cross = (a: Alt[], b: Alt[]): Alt[] | null => {
    if (a.length * b.length > MAX_COMBINATIONS) return null;
    const out: Alt[] = [];
    for (const x of a) for (const y of b) out.push([...x, ...y]);
    return out;
  };
  const tooMany = (node: ts.Node): Alts => ({
    opaque: node,
    reason: `more than ${MAX_COMBINATIONS} combinations`,
  });

  const strip = (e: ts.Expression): ts.Expression =>
    ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e)
      ? strip(e.expression)
      : e;
  /** The object literals a const table expression can be, or null. */
  const objectsOf = (e: ts.Expression, depth = 0): ts.ObjectLiteralExpression[] | null => {
    if (depth > 4) return null;
    e = strip(e);
    if (ts.isObjectLiteralExpression(e)) return [e];
    if (ts.isIdentifier(e)) {
      const init = consts.get(e.text);
      return init ? objectsOf(init, depth + 1) : null;
    }
    if (ts.isElementAccessExpression(e) || ts.isPropertyAccessExpression(e)) {
      const values = tableValues(e, depth + 1);
      if (!values) return null;
      const out: ts.ObjectLiteralExpression[] = [];
      for (const v of values) {
        const o = objectsOf(v, depth + 1);
        if (!o) return null;
        out.push(...o);
      }
      return out;
    }
    return null;
  };
  /** The values `table[key]` / `table.key` can take, or null if unlisted. */
  const tableValues = (
    e: ts.ElementAccessExpression | ts.PropertyAccessExpression,
    depth = 0,
  ): ts.Expression[] | null => {
    const objects = objectsOf(e.expression, depth);
    if (!objects) return null;
    const wanted = ts.isPropertyAccessExpression(e)
      ? e.name.text
      : ts.isStringLiteral(e.argumentExpression)
        ? e.argumentExpression.text
        : null;
    const out: ts.Expression[] = [];
    for (const o of objects) {
      for (const p of o.properties) {
        if (!ts.isPropertyAssignment(p)) return null;
        const key =
          ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
        if (key === null) return null;
        if (wanted === null || key === wanted) out.push(p.initializer);
      }
    }
    return out.length ? out : null;
  };

  const seen = new Set<string>();
  /** List every way `node` can render as classes. */
  const alts = (node: ts.Expression, dynamic: boolean): Alts => {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))
      return alts(node.expression, dynamic);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      return { alts: [tokensOf(node.text, textStart(node), dynamic)] };
    if (ts.isNumericLiteral(node) || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.UndefinedKeyword)
      return { alts: [[]] };
    if (ts.isTemplateExpression(node)) {
      let acc: Alt[] = [tokensOf(node.head.text, textStart(node.head), dynamic)];
      for (const span of node.templateSpans) {
        const inner = alts(span.expression, true);
        if ("opaque" in inner) return inner;
        const tail = tokensOf(span.literal.text, textStart(span.literal), dynamic);
        const next = cross(acc, inner.alts);
        if (!next) return tooMany(node);
        acc = next.map((a) => [...a, ...tail]);
      }
      return { alts: acc };
    }
    if (ts.isConditionalExpression(node)) {
      const a = alts(node.whenTrue, dynamic);
      if ("opaque" in a) return a;
      const b = alts(node.whenFalse, dynamic);
      if ("opaque" in b) return b;
      const all = [...a.alts, ...b.alts];
      return all.length > MAX_COMBINATIONS ? tooMany(node) : { alts: all };
    }
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
        // Renders the right side, or a falsy value that adds no class.
        const r = alts(node.right, dynamic);
        return "opaque" in r ? r : { alts: [...r.alts, []] };
      }
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        const l = alts(node.left, dynamic);
        if ("opaque" in l) return l;
        const r = alts(node.right, dynamic);
        if ("opaque" in r) return r;
        return { alts: [...l.alts, ...r.alts] };
      }
      if (op === ts.SyntaxKind.PlusToken) {
        const l = alts(node.left, dynamic);
        if ("opaque" in l) return l;
        const r = alts(node.right, dynamic);
        if ("opaque" in r) return r;
        const both = cross(l.alts, r.alts);
        return both ? { alts: both } : tooMany(node);
      }
    }
    if (ts.isIdentifier(node)) {
      const init = consts.get(node.text);
      if (init && !seen.has(node.text)) {
        seen.add(node.text);
        try {
          return alts(init, dynamic);
        } finally {
          seen.delete(node.text);
        }
      }
    }
    // A const lookup table: TONES[key], TONES.key, TONES[key].bar.
    if (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) {
      const values = tableValues(node);
      if (values) {
        const all: Alt[] = [];
        for (const v of values) {
          const r = alts(v, dynamic);
          if ("opaque" in r) return r;
          all.push(...r.alts);
        }
        if (all.length > MAX_COMBINATIONS) return tooMany(node);
        if (all.length) return { alts: all };
      }
    }
    return { opaque: node, reason: "not a class string" };
  };

  /** Judge one combination of a template or string. */
  const judge = (alt: Alt, fallbackLine: number) => {
    if (alt.some((t) => t.text === "dark")) return;
    const pick = (of: (t: string) => string | null) => {
      const all = alt.filter((t) => of(t.text) !== null);
      const dyn = all.filter((t) => t.dynamic);
      return dyn.length ? dyn : all;
    };
    const fills = pick(fillOf);
    const texts = pick(textOf);
    for (const f of fills) {
      const fc = fillOf(f.text)!;
      const ft = tone(fc);
      if (!ft) continue;
      for (const t of texts) {
        const tc = textOf(t.text)!;
        if (ft === tone(tc)) add(`${Math.max(f.line, t.line) || fallbackLine}:text-${tc} on bg-${fc}`);
      }
    }
  };

  /** Static classes that make an unlisted interpolation worth reporting. */
  const tonedStatics = (node: ts.TemplateExpression) => {
    const raw = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ");
    if (/[=;<>()]/.test(raw)) return [];
    const toks = raw.split(TOKEN_SPLIT).filter(Boolean);
    if (toks.includes("dark")) return [];
    return toks.filter((t) => {
      const c = fillOf(t) ?? textOf(t);
      return c !== null && tone(c) !== null;
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isTemplateExpression(node)) {
      const r = alts(node, false);
      if ("opaque" in r) {
        const toned = tonedStatics(node);
        if (toned.length) {
          const what = r.reason === "not a class string"
            ? "${" + r.opaque.getText(sf).replace(/\s+/g, " ").slice(0, 60) + "}"
            : r.reason;
          add(`${lineAt(r.opaque.getStart(sf))}:cannot judge ${what} with ${toned.join(" ")}`);
        }
        // Judge what can be judged: the parts of each span on their own.
        ts.forEachChild(node, visit);
        return;
      }
      for (const a of r.alts) judge(a, lineAt(node.getStart(sf)));
      // Strings inside an opaque call in a span are visited by the opaque
      // branch above; a fully listed template has judged all of them.
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      judge(tokensOf(node.text, textStart(node), false), lineAt(node.getStart(sf)));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}
