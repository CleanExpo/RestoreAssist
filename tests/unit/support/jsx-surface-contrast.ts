import ts from "typescript";
import { contrast, hexToRgb, isColour, over, resolve, type Rgb } from "./wcag-contrast";

/**
 * RA-8549. Measures each `text-{colour}` class in a TSX source against the
 * surface the element actually sits on, read from the JSX tree: the nearest
 * solid `bg-` on the element itself or an ancestor, with translucent `bg-x/NN`
 * fills composited over what is beneath them. It replaces the RA-4868 guard's
 * fixed list of "navy-band" text colours, which trusted the colour name rather
 * than the surface, so a navy-band colour on a light surface (or a light-surface
 * colour on the navy band) passed unmeasured.
 *
 * Rules, matching axe-core's color-contrast rule:
 *  - the threshold is 4.5:1, or 3:1 for large text (at least 24px, or at
 *    least 18.66px and bold), with the size and weight inherited down the tree;
 *  - `aria-hidden` does not exempt text (axe measures it too);
 *  - only unprefixed classes are measured: `dark:`, `hover:`, `sm:` and other
 *    variants are not, because the public pages render light and the smallest
 *    breakpoint is the one every visitor gets first.
 *
 * Within one className, each string literal is a class group. A text colour
 * whose own group sets a solid `bg-` is measured against that fill (this is how
 * `cond ? "bg-brand-navy text-white" : "bg-white text-brand-navy"` pairs up).
 * When an element's className can resolve to more than one fill, its children
 * are measured against every one of them.
 *
 * Limits, named so nobody reads a pass as more than it is: `style={{...}}`
 * colours, CSS-module classes, background images and gradients, and fills set
 * by a parent component in another file are not seen. A component's root is
 * measured against `rootSurface` (the darkest light canvas on the public
 * pages) unless a caller passes the surface it is rendered on.
 */

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

export interface ContrastFinding {
  /** `file|class`, stable across line moves. */
  key: string;
  line: number;
  cls: string;
  ratio: number;
  required: number;
  surface: string;
}

interface Colour {
  name: string;
  rgb: Rgb;
  alpha: number;
}

/** `slate-500`, `brand-harbour/35`, `[#7BA3BD]`, `[#F0F3F6]/80` -> colour. */
export function readColour(token: string): Colour | null {
  const m = token.match(/^(\[#[0-9a-fA-F]{6}\]|[a-z][a-z0-9-]*)(?:\/(\d+))?$/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const alpha = m[2] ? Number(m[2]) / 100 : 1;
  if (name.startsWith("[")) return { name, rgb: hexToRgb(name.slice(1, -1)), alpha };
  return isColour(name) ? { name, rgb: resolve(name), alpha } : null;
}

const NAMED_SIZE: Record<string, number> = {
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36,
  "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128,
};

function length(value: string): number | null {
  const m = value.match(/^([\d.]+)(px|rem)$/);
  if (!m) return null;
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
}

/** Font size in px from a `text-` token, or null if the token is not a size. */
export function readSize(token: string): number | null {
  const named = token.match(/^text-([a-z0-9]+)(?:\/.+)?$/);
  if (named && named[1] in NAMED_SIZE) return NAMED_SIZE[named[1]];
  const arb = token.match(/^text-\[(.+)\]$/);
  if (!arb) return null;
  const v = arb[1];
  // clamp(min, preferred, max): the smallest size any viewport gets.
  const clamp = v.match(/^clamp\(([^,]+),/);
  return length(clamp ? clamp[1] : v);
}

const BOLD = new Set(["font-bold", "font-extrabold", "font-black"]);

interface Ctx {
  surfaces: Rgb[];
  size: number;
  bold: boolean;
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

function splitClasses(text: string): string[] {
  return text
    .split(/\s+/)
    .map((c) => c.replace(/^["'`{(]+|["'`})]+$/g, ""))
    .filter(Boolean);
}

interface Literal {
  text: string;
  /** `file:pos` of each literal it came from, so the guard can tell which it measured. */
  ids: string[];
}

type Consts = Map<string, Literal>;

function isPlainString(n: ts.Node): n is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
}

function unwrap(n: ts.Expression): ts.Expression {
  while (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isParenthesizedExpression(n)) {
    n = n.expression;
  }
  return n;
}

/**
 * Module-level string constants: `const X = "classes"` as `X`, and string
 * properties of `const OBJ = { key: "classes" }` as `OBJ.key`, so `${CONTAINER}`
 * and `${LANDING.muted}` resolve to the classes they hold.
 */
export function constStrings(sf: ts.SourceFile, rel: string): Consts {
  const out: Consts = new Map();
  const id = (n: ts.Node) => `${rel}:${n.getStart()}`;
  /** A string, a known constant, or `[...].join(" ")` of those. */
  const read = (raw: ts.Expression): Literal | null => {
    const n = unwrap(raw);
    if (isPlainString(n)) return { text: n.text, ids: [id(n)] };
    if (ts.isIdentifier(n)) return out.get(n.text) ?? null;
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "join" &&
      ts.isArrayLiteralExpression(n.expression.expression)
    ) {
      const parts = n.expression.expression.elements.map(read);
      if (parts.some((p) => p === null)) return null;
      return {
        text: parts.map((p) => p!.text).join(" "),
        ids: parts.flatMap((p) => p!.ids),
      };
    }
    return null;
  };
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const init = unwrap(d.initializer);
      const value = read(init);
      if (value) out.set(d.name.text, value);
      else if (ts.isObjectLiteralExpression(init)) {
        for (const prop of init.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
          const v = read(prop.initializer);
          if (key && v) out.set(`${d.name.text}.${key}`, v);
        }
      }
    }
  }
  return out;
}

/** `X` or `OBJ.key` as a lookup key, or null. */
function refName(n: ts.Node): string | null {
  if (ts.isIdentifier(n)) return n.text;
  if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
    return `${n.expression.text}.${n.name.text}`;
  }
  return null;
}

/** Class groups in a className expression: one per string literal. */
function classGroups(expr: ts.Node, consts: Consts, rel: string, used: Set<string>): string[][] {
  const groups: string[][] = [];
  const lookup = (n: ts.Node): string | null => {
    const name = refName(n);
    const hit = name ? consts.get(name) : undefined;
    if (!hit) return null;
    hit.ids.forEach((i) => used.add(i));
    return hit.text;
  };
  const visit = (n: ts.Node) => {
    if (isPlainString(n)) {
      used.add(`${rel}:${n.getStart()}`);
      groups.push(splitClasses(n.text));
      return;
    }
    if (ts.isTemplateExpression(n)) {
      used.add(`${rel}:${n.head.getStart()}`);
      const own = splitClasses(n.head.text);
      for (const span of n.templateSpans) {
        const resolved = lookup(span.expression);
        if (resolved !== null) own.push(...splitClasses(resolved));
        else visit(span.expression);
        used.add(`${rel}:${span.literal.getStart()}`);
        own.push(...splitClasses(span.literal.text));
      }
      groups.push(own);
      return;
    }
    const resolved = lookup(n);
    if (resolved !== null) {
      groups.push(splitClasses(resolved));
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(expr);
  return groups;
}

/** A `text-{colour}` class the guard can measure. */
function hasTextColour(text: string): boolean {
  return splitClasses(text).some((c) => {
    const t = c.match(/^text-(.+)$/);
    return t ? readColour(t[1]) !== null : false;
  });
}

/** Every string literal in `src` that holds a measurable text colour. */
export function colourLiterals(src: string, rel: string): { id: string; line: number; text: string }[] {
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { id: string; line: number; text: string }[] = [];
  const visit = (n: ts.Node) => {
    if (
      (isPlainString(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) &&
      hasTextColour(n.text)
    ) {
      out.push({
        id: `${rel}:${n.getStart()}`,
        line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
        text: n.text,
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function solidFill(group: string[]): Colour | null {
  for (const c of group) {
    const m = c.match(/^bg-(.+)$/);
    const colour = m ? readColour(m[1]) : null;
    if (colour) return colour;
  }
  return null;
}

/**
 * Scan one TSX source. `rel` names the file in findings; `rootSurface` is the
 * surface the component's outermost element is painted on.
 */
export interface ScanOptions {
  /** Surface the component's outermost element is painted on. */
  rootSurface?: Rgb;
  /**
   * Reads an import (`./motion` or `@/components/...` from `rel`) and returns
   * its path and source, so imported class constants resolve. Return null to
   * skip it (packages, unknown aliases).
   */
  readImport?: (rel: string, specifier: string) => { rel: string; src: string } | null;
}

export interface ScanResult {
  findings: ContrastFinding[];
  /** Text-colour pairs measured (one per class per possible surface). */
  measured: number;
  /** Ids (`file:pos`) of the class-string literals the scan measured. */
  used: Set<string>;
}

export function scanSource(src: string, rel: string, options: ScanOptions = {}): ScanResult {
  const rootSurface = options.rootSurface ?? hexToRgb("#F0F3F6");
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const consts = constStrings(sf, rel);
  const used = new Set<string>();
  for (const st of sf.statements) {
    if (!options.readImport || !ts.isImportDeclaration(st)) continue;
    const spec = (st.moduleSpecifier as ts.StringLiteral).text;
    const names = st.importClause?.namedBindings;
    if (!names || !ts.isNamedImports(names)) continue;
    const mod = options.readImport(rel, spec);
    if (!mod) continue;
    const modSf = ts.createSourceFile(mod.rel, mod.src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const exported = constStrings(modSf, mod.rel);
    for (const el of names.elements) {
      const remote = (el.propertyName ?? el.name).text;
      const local = el.name.text;
      for (const [k, v] of exported) {
        if (k === remote || k.startsWith(`${remote}.`)) {
          consts.set(local + k.slice(remote.length), v);
        }
      }
    }
  }
  const findings: ContrastFinding[] = [];
  let measured = 0;

  const element = (node: ts.JsxOpeningLikeElement, ctx: Ctx): Ctx => {
    const attr = node.attributes.properties.find(
      (p): p is ts.JsxAttribute =>
        ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === "className",
    );
    const init = attr?.initializer;
    if (!init) return ctx;
    const groups = classGroups(
      ts.isJsxExpression(init) ? init.expression ?? init : init,
      consts,
      rel,
      used,
    );
    const all = groups.flat();

    let size = ctx.size;
    let bold = ctx.bold;
    for (const c of all) {
      const s = readSize(c);
      if (s !== null) size = s;
      if (BOLD.has(c)) bold = true;
      else if (/^font-(thin|extralight|light|normal|medium|semibold)$/.test(c)) bold = false;
    }
    const large = size >= 24 || (bold && size >= 18.66);
    const required = large ? AA_LARGE : AA_NORMAL;

    // The fills this element can paint, each over every surface beneath it.
    const fills = groups.map(solidFill).filter((f): f is Colour => f !== null);
    const surfaces = fills.length
      ? fills.flatMap((f) => ctx.surfaces.map((s) => over(f.rgb, f.alpha, s)))
      : ctx.surfaces;

    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    for (const group of groups) {
      const own = solidFill(group);
      const beneath = own
        ? ctx.surfaces.map((s) => over(own.rgb, own.alpha, s))
        : surfaces;
      for (const cls of group) {
        const t = cls.match(/^text-(.+)$/);
        const text = t ? readColour(t[1]) : null;
        if (!text) continue;
        for (const surface of beneath) {
          measured++;
          const ratio = contrast(over(text.rgb, text.alpha, surface), surface);
          if (ratio < required) {
            findings.push({ key: `${rel}|${cls}`, line, cls, ratio, required, surface: hex(surface) });
          }
        }
      }
    }
    return { surfaces, size, bold };
  };

  const visit = (node: ts.Node, ctx: Ctx) => {
    if (ts.isJsxElement(node)) {
      const inner = element(node.openingElement, ctx);
      ts.forEachChild(node.openingElement.attributes, (c) => visit(c, ctx));
      for (const child of node.children) visit(child, inner);
      return;
    }
    if (ts.isJsxSelfClosingElement(node)) {
      element(node, ctx);
      ts.forEachChild(node.attributes, (c) => visit(c, ctx));
      return;
    }
    ts.forEachChild(node, (c) => visit(c, ctx));
  };
  visit(sf, { surfaces: [rootSurface], size: 16, bold: false });
  return { findings, measured, used };
}
