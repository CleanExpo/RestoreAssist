#!/usr/bin/env node
/**
 * RA-8609 - fail when a product component declares an optional `on*` handler
 * prop that no screen passes.
 *
 * The defect kind: a component always draws an editing control, treats the
 * handler behind it as optional, and no mount supplies the handler. TypeScript
 * accepts the mount, the control moves on screen, and nothing is saved. Three
 * were found in 24 hours (RA-8605, RA-8606, RA-8609: the floor plan room
 * Opacity slider).
 *
 * Rule: for every `onX?:` prop declared in a non-test .tsx file under
 * `components/` or `app/` (outside the vendored kits `components/ui` and
 * `components/ai-elements`), at least one non-test .ts/.tsx file under
 * `app/`, `components/`, `lib/` or `hooks/` must contain the JSX attribute
 * `onX=`. Test files do not count: a test that passes the handler proves the
 * component works, not that a screen wires it.
 *
 * There is deliberately no list of exempt product handlers. A handler nobody
 * passes is either wired by a mount or removed from the props.
 *
 * Limits (stated, not hidden): matching is by prop name, so two components
 * sharing a handler name can hide a miss; props passed through a spread
 * (`{...props}`) are not followed.
 *
 * Usage:  node scripts/check-unpassed-handlers.mjs [--root DIR]
 *         node scripts/check-unpassed-handlers.mjs --self-test
 * Output: one `UNPASSED <name> <file>:<line>` line per finding; exit 1 when
 *         any are found, 0 when none.
 */
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DECLARE_ROOTS = ["components", "app"];
const MOUNT_ROOTS = ["app", "components", "lib", "hooks"];
const VENDORED_KITS = ["components/ui", "components/ai-elements"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__mocks__"]);
const DECLARATION = /^\s*(on[A-Z][A-Za-z0-9]*)\?\s*:/;

function isTestFile(rel) {
  return (
    /\.(test|spec)\.tsx?$/.test(rel) ||
    rel.split("/").some((part) => SKIP_DIRS.has(part))
  );
}

function listFiles(root, dir, exts) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...listFiles(root, rel, exts));
    } else if (
      exts.some((ext) => entry.name.endsWith(ext)) &&
      !isTestFile(rel)
    ) {
      out.push(rel);
    }
  }
  return out;
}

/** Returns [{ name, file, line }] for every optional on* prop no mount passes. */
export function findUnpassedHandlers(root) {
  const declared = new Map();
  for (const base of DECLARE_ROOTS) {
    for (const file of listFiles(root, base, [".tsx"])) {
      if (
        VENDORED_KITS.some((kit) => file === kit || file.startsWith(`${kit}/`))
      )
        continue;
      readFileSync(join(root, file), "utf8")
        .split("\n")
        .forEach((text, index) => {
          const match = DECLARATION.exec(text);
          if (match && !declared.has(match[1])) {
            declared.set(match[1], { name: match[1], file, line: index + 1 });
          }
        });
    }
  }

  const sources = MOUNT_ROOTS.flatMap((base) =>
    listFiles(root, base, [".ts", ".tsx"]),
  ).map((file) => readFileSync(join(root, file), "utf8"));
  const unpassed = [];
  for (const decl of declared.values()) {
    const attribute = new RegExp(`(^|[\\s{(])${decl.name}=`, "m");
    if (!sources.some((text) => attribute.test(text))) unpassed.push(decl);
  }
  return unpassed.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Positive and negative control on a throwaway tree: a planted handler that
 * only a test passes must be reported; a passed handler and a vendored-kit
 * handler must not.
 */
export function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "ra8609-handlers-"));
  const put = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  try {
    put(
      "components/sketch/Panel.tsx",
      "interface Props {\n  onPlantedChange?: (v: number) => void;\n  onUsedChange?: (v: number) => void;\n}\n",
    );
    put(
      "components/sketch/Editor.tsx",
      "export const E = () => <Panel onUsedChange={(v) => v} />;\n",
    );
    put(
      "components/sketch/__tests__/Panel.test.tsx",
      "render(<Panel onPlantedChange={vi.fn()} />);\n",
    );
    put(
      "components/ui/slider.tsx",
      "interface P {\n  onKitChange?: () => void;\n}\n",
    );
    const found = findUnpassedHandlers(root).map((f) => f.name);
    const ok = found.length === 1 && found[0] === "onPlantedChange";
    return { ok, found };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main(argv) {
  if (argv.includes("--self-test")) {
    const { ok, found } = selfTest();
    console.log(
      `self-test ${ok ? "PASS" : "FAIL"}: reported [${found.join(", ")}], expected [onPlantedChange]`,
    );
    return ok ? 0 : 1;
  }
  const rootFlag = argv.indexOf("--root");
  const root =
    rootFlag >= 0
      ? resolve(argv[rootFlag + 1])
      : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const unpassed = findUnpassedHandlers(root);
  for (const f of unpassed)
    console.log(`UNPASSED ${f.name} ${f.file.split(sep).join("/")}:${f.line}`);
  if (unpassed.length > 0) {
    console.error(
      `\n${unpassed.length} optional handler prop(s) are passed by no screen. Wire each one from a mount, ` +
        "or remove the prop and the control it drives (RA-8609). There is no exemption list.",
    );
    return 1;
  }
  console.log(
    "check-unpassed-handlers: every optional on* prop is passed by at least one mount.",
  );
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}
