#!/usr/bin/env node
/**
 * RestoreAssist - icon-only button name guard (RA-8393, follows RA-1575).
 *
 * A <button> or <Button> whose only content is an icon has no accessible name
 * unless it carries one explicitly. A screen reader announces it as "button"
 * and a voice-control user cannot say it. RA-1575 fixed six by hand; with no
 * check, the count grew back to 44.
 *
 * Why not eslint-plugin-jsx-a11y/control-has-associated-label: that rule
 * treats any custom component child (<Trash2 />, <X />) as possibly labelled,
 * so it passes exactly the case this guard exists for (probed 2026-11-17,
 * plugin 6.10.2: <button><Trash2 /></button> reported clean).
 *
 * A button is flagged when ALL of these hold:
 *   - the tag is `button` or `Button`, with children (not self-closing);
 *   - the opening tag has no aria-label, aria-labelledby, title or {...spread};
 *   - nothing in its subtree can supply a name: no visible text, no {expression},
 *     no `sr-only` class, no aria-label / aria-labelledby / title / non-empty alt
 *     on a descendant;
 *   - its subtree contains at least one element (the icon).
 *
 * Strict: any flagged button fails. Per-button opt-out: a `ra-allow-unnamed-button`
 * comment on the line of the opening tag (state why in the same comment).
 *
 * Usage:  node scripts/check-icon-button-names.mjs [--self-test]
 *         npm run check:icon-button-names
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, relative } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];
const IGNORE_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", "__tests__"]);
const BUTTON_TAGS = new Set(["button", "Button"]);
const NAME_ATTRS = new Set(["aria-label", "aria-labelledby", "title"]);
const ALLOW_MARKER = "ra-allow-unnamed-button";

function attrName(attr) {
  return ts.isJsxAttribute(attr) ? attr.name.getText() : null;
}

function hasNameAttr(attributes, { allowAlt }) {
  for (const attr of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attr)) return true; // cannot judge: treat as named
    const name = attrName(attr);
    if (NAME_ATTRS.has(name)) return true;
    if (allowAlt && name === "alt") {
      const init = attr.initializer;
      if (!init) continue;
      if (ts.isStringLiteral(init) && init.text.trim() === "") continue;
      return true;
    }
    if (name === "className" || name === "class") {
      if (attr.initializer && attr.initializer.getText().includes("sr-only")) return true;
    }
  }
  return false;
}

/** Returns { mayName, hasElement } for a list of JSX children. */
function inspectChildren(children) {
  let hasElement = false;
  for (const child of children) {
    if (ts.isJsxText(child)) {
      if (child.text.trim() !== "") return { mayName: true, hasElement };
      continue;
    }
    if (ts.isJsxExpression(child)) {
      if (child.expression) return { mayName: true, hasElement };
      continue; // {/* comment */}
    }
    if (ts.isJsxSelfClosingElement(child)) {
      hasElement = true;
      if (hasNameAttr(child.attributes, { allowAlt: true })) return { mayName: true, hasElement };
      continue;
    }
    if (ts.isJsxElement(child)) {
      hasElement = true;
      if (hasNameAttr(child.openingElement.attributes, { allowAlt: true })) {
        return { mayName: true, hasElement };
      }
      const inner = inspectChildren(child.children);
      if (inner.mayName) return { mayName: true, hasElement };
      continue;
    }
    if (ts.isJsxFragment(child)) {
      const inner = inspectChildren(child.children);
      hasElement = hasElement || inner.hasElement;
      if (inner.mayName) return { mayName: true, hasElement };
    }
  }
  return { mayName: false, hasElement };
}

export function findUnnamedButtons(sourceText, fileName = "input.tsx") {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = sourceText.split("\n");
  const hits = [];
  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      const open = node.openingElement;
      const tag = open.tagName.getText(sf);
      if (BUTTON_TAGS.has(tag) && !hasNameAttr(open.attributes, { allowAlt: false })) {
        const { mayName, hasElement } = inspectChildren(node.children);
        if (!mayName && hasElement) {
          const line = sf.getLineAndCharacterOfPosition(open.getStart(sf)).line;
          if (!lines[line].includes(ALLOW_MARKER)) hits.push({ line: line + 1, tag });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!IGNORE_DIRS.has(name)) walk(full, out);
    } else if (extname(name) === ".tsx" && !/\.(test|spec|stories)\.tsx$/.test(name)) {
      out.push(full);
    }
  }
}

function selfTest() {
  const flagged = [
    ["lucide icon", `<button onClick={f}><Trash2 className="h-4 w-4" /></button>`],
    ["Button + icon", `<Button variant="ghost" onClick={f}><X /></Button>`],
    ["nested svg", `<button onClick={f}><svg><path d="M0" /></svg></button>`],
    ["empty alt", `<button onClick={f}><img src="x.png" alt="" /></button>`],
  ];
  const clean = [
    ["aria-label", `<button aria-label="Close" onClick={f}><X /></button>`],
    ["visible text", `<button onClick={f}><Plus /> Add item</button>`],
    ["expression child", `<button onClick={f}><X />{label}</button>`],
    ["sr-only span", `<button onClick={f}><X /><span className="sr-only">Close</span></button>`],
    ["spread props", `<Button {...props}><X /></Button>`],
    ["text in nested span", `<button onClick={f}><span>Save</span></button>`],
    ["allow marker", `<button onClick={f}> {/* ra-allow-unnamed-button: decorative */}<X /></button>`],
  ];
  let failed = 0;
  for (const [label, jsx] of flagged) {
    const n = findUnnamedButtons(`const a = ${jsx};`).length;
    if (n !== 1) { failed++; console.error(`SELF-TEST FAIL: "${label}" should be flagged (got ${n})`); }
  }
  for (const [label, jsx] of clean) {
    const n = findUnnamedButtons(`const a = ${jsx};`).length;
    if (n !== 0) { failed++; console.error(`SELF-TEST FAIL: "${label}" should be clean (got ${n})`); }
  }
  if (failed) process.exit(1);
  console.log(`check-icon-button-names self-test: ${flagged.length} planted defects flagged, ${clean.length} clean controls passed.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = [];
  for (const d of SCAN_DIRS) {
    const abs = join(ROOT, d);
    if (existsSync(abs)) walk(abs, files);
  }
  if (files.length === 0) {
    console.error("check-icon-button-names: scanned 0 files; refusing to report a pass.");
    process.exit(2);
  }
  const problems = [];
  for (const full of files) {
    const rel = relative(ROOT, full).split("\\").join("/");
    for (const hit of findUnnamedButtons(readFileSync(full, "utf8"), rel)) {
      problems.push(`${rel}:${hit.line}  <${hit.tag}> has only an icon and no accessible name`);
    }
  }
  if (problems.length) {
    console.error(`check-icon-button-names: ${problems.length} icon-only button(s) with no name:\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      `\nAdd an aria-label that states the action and the object, e.g. aria-label="Remove line item".`,
    );
    process.exit(1);
  }
  console.log(`check-icon-button-names: ${files.length} files scanned, every icon-only button has a name.`);
}

main();
