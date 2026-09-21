#!/usr/bin/env node
/**
 * RestoreAssist - UTF-8 encoding guard.
 *
 * Fails if any agent-instruction / rule file is not clean UTF-8 text. This
 * catches the mojibake-corruption class (RA-6938 / RA-7459): CLAUDE.md was
 * silently committed as invalid-UTF-8 "data" from the Commands section
 * onward, and the common Windows form — a file read as CP1252 and re-saved
 * as UTF-8, turning `—` into `â€”` — produces bytes that are perfectly
 * valid UTF-8. A leading byte-order mark sails through a fatal decoder too.
 *
 * A file is checked in this order (later checks run only on a successful
 * decode; the fatal decoder is never skipped or weakened):
 *   1. Bytes must decode as UTF-8 with no replacement/invalid sequences.
 *   2. A leading UTF-8 BOM (EF BB BF) is rejected.
 *   3. CP1252-through-UTF-8 mojibake is rejected. The engine is a CP1252
 *      round-trip (each decoded character mapped back to the CP1252 byte it
 *      came from, then that byte run strictly decoded as UTF-8). Only a
 *      genuine double-encoding forms a valid multi-byte UTF-8 sequence.
 *      Two visible signatures cover the cases round-trip cannot see:
 *        - `â€` (E2 80 xx punctuation: em dash, curly quotes, ellipsis)
 *          even when the third byte is missing or is ASCII.
 *        - `Ã` or `Â` followed by punctuation or whitespace (`Â,`). Real
 *          French / Portuguese keeps a letter after those capitals
 *          (`NÃO`, `CÂBLE`, `Âge`) and is not flagged.
 *
 * Checked files (scope is deliberate — do not widen here; see RA-7459):
 *   - CLAUDE.md
 *   - AGENTS.md            (if present)
 *   - .claude/rules/*.md
 *
 * Usage:  node scripts/check-encoding.mjs
 *         npm run check:encoding
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

const UTF8_FATAL = new TextDecoder("utf-8", { fatal: true });

const BOM_0 = 0xef;
const BOM_1 = 0xbb;
const BOM_2 = 0xbf;

/**
 * CP1252 extras in 0x80–0x9F. Slots with no defined glyph (0x81, 0x8D,
 * 0x8F, 0x90, 0x9D) stay as C1 controls and map to themselves via Latin-1.
 * Built as codepoint → byte so a decoded character can be walked back to
 * the single CP1252 byte a Windows editor would have written.
 */
const CP1252_EXTRAS = new Map([
  [0x20ac, 0x80], // €
  [0x201a, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201e, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02c6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8a], // Š
  [0x2039, 0x8b], // ‹
  [0x0152, 0x8c], // Œ
  [0x017d, 0x8e], // Ž
  [0x2018, 0x91], // ‘
  [0x2019, 0x92], // ’
  [0x201c, 0x93], // “
  [0x201d, 0x94], // ”
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02dc, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9a], // š
  [0x203a, 0x9b], // ›
  [0x0153, 0x9c], // œ
  [0x017e, 0x9e], // ž
  [0x0178, 0x9f], // Ÿ
]);

/** `â€` — CP1252 reading of UTF-8 E2 80 xx. Never legitimate in these files. */
const SIGNATURE_E2_80 = /\u00E2\u20AC/;

/**
 * `Ã` / `Â` followed by punctuation or whitespace. Real accented words keep
 * a letter (`NÃO`, `CÂBLE`); leftover `Â,` is the typical Windows artefact.
 */
const SIGNATURE_A_PLUS_PUNCT = /[\u00C3\u00C2][\s\u00A0\p{P}]/u;

/** Map a Unicode code point back to its CP1252 byte, or null if it has none. */
export function cp1252Byte(codePoint) {
  const extra = CP1252_EXTRAS.get(codePoint);
  if (extra !== undefined) return extra;
  if (codePoint <= 0xff) return codePoint;
  return null;
}

function utf8SequenceLength(startByte) {
  if (startByte >= 0xc2 && startByte <= 0xdf) return 2;
  if (startByte >= 0xe0 && startByte <= 0xef) return 3;
  if (startByte >= 0xf0 && startByte <= 0xf4) return 4;
  return 0;
}

/**
 * Walk decoded text, remap each character to its CP1252 byte, and look for
 * a valid multi-byte UTF-8 sequence in that byte run. `JOÃO` remaps to
 * C3 4F (not a continuation) and is not flagged; `Ã©` (Ã + ©) remaps to
 * C3 A9 and decodes as `é`.
 *
 * @param {string} text
 * @returns {number | null} character offset of the first hit
 */
export function findRoundTripMojibake(text) {
  const chars = [...text];
  const mapped = chars.map((ch) => cp1252Byte(ch.codePointAt(0)));

  for (let i = 0; i < mapped.length; i++) {
    const start = mapped[i];
    if (start === null) continue;
    const len = utf8SequenceLength(start);
    if (len === 0 || i + len > mapped.length) continue;
    const slice = mapped.slice(i, i + len);
    if (slice.some((b) => b === null)) continue;
    try {
      UTF8_FATAL.decode(Uint8Array.from(slice));
      return i;
    } catch {
      // Not a valid UTF-8 sequence at this offset — keep scanning.
    }
  }
  return null;
}

/**
 * Visible signatures the ticket names. Each covers a case the round-trip
 * cannot see on its own (see the tests that delete one arm at a time).
 *
 * @param {string} text
 * @returns {number | null}
 */
export function findVisibleMojibake(text) {
  const euro = text.search(SIGNATURE_E2_80);
  if (euro !== -1) return euro;
  const punct = text.search(SIGNATURE_A_PLUS_PUNCT);
  if (punct !== -1) return punct;
  return null;
}

export function hasLeadingBom(bytes) {
  return (
    bytes.length >= 3 &&
    bytes[0] === BOM_0 &&
    bytes[1] === BOM_1 &&
    bytes[2] === BOM_2
  );
}

function invalidUtf8Reason(bytes, err) {
  let offset = null;
  for (let i = 1; i <= bytes.length; i++) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, i));
    } catch {
      offset = i - 1;
      break;
    }
  }
  return `invalid UTF-8${offset === null ? "" : ` at byte ${offset}`} (${err.message})`;
}

/**
 * Inspect one file's bytes. Returns zero or more failure reasons.
 * Invalid UTF-8 stops further checks (there is no decoded text to scan).
 *
 * @param {Uint8Array | Buffer} bytes
 * @returns {string[]}
 */
export function inspectBytes(bytes) {
  const reasons = [];
  let text;
  try {
    text = UTF8_FATAL.decode(bytes);
  } catch (err) {
    reasons.push(invalidUtf8Reason(bytes, err));
    return reasons;
  }

  if (hasLeadingBom(bytes)) {
    reasons.push("leading UTF-8 byte-order mark");
  }

  const roundTrip = findRoundTripMojibake(text);
  if (roundTrip !== null) {
    reasons.push(`CP1252-through-UTF-8 mojibake at character ${roundTrip}`);
    return reasons;
  }

  const visible = findVisibleMojibake(text);
  if (visible !== null) {
    reasons.push(`CP1252-through-UTF-8 mojibake at character ${visible}`);
  }

  return reasons;
}

/**
 * Explicit files + a glob-equivalent for .claude/rules/*.md.
 * Scope is the RA-6938 / RA-7459 instruction set. Do not add source trees.
 *
 * @param {string} [root]
 * @returns {string[]}
 */
export function collectTargets(root = ROOT) {
  const files = [];
  for (const rel of ["CLAUDE.md", "AGENTS.md"]) {
    const p = join(root, rel);
    if (existsSync(p)) files.push(p);
  }
  const rulesDir = join(root, ".claude", "rules");
  if (existsSync(rulesDir)) {
    for (const entry of readdirSync(rulesDir)) {
      if (entry.endsWith(".md")) files.push(join(rulesDir, entry));
    }
  }
  return files;
}

export function main(root = ROOT) {
  const failures = [];

  for (const file of collectTargets(root)) {
    const rel = relative(root, file).split("\\").join("/");
    let bytes;
    try {
      bytes = readFileSync(file);
    } catch (err) {
      failures.push({ rel, reason: `unreadable: ${err.message}` });
      continue;
    }
    const reasons = inspectBytes(bytes);
    if (reasons.length > 0) {
      failures.push({ rel, reason: reasons.join("; ") });
    }
  }

  if (failures.length === 0) {
    console.log(
      "check:encoding - OK. All agent-instruction / rule files are clean UTF-8 text.",
    );
    return 0;
  }

  console.error(
    `check:encoding - ${failures.length} file(s) failed the encoding guard:`,
  );
  for (const f of failures) {
    console.error(`  ${f.rel}  ${f.reason}`);
  }
  console.error(
    "\nRestore the file from the last clean commit and re-save as UTF-8 without a BOM. See RA-6938 / RA-7459.\n",
  );
  return 1;
}

// Run only when invoked directly (not when imported by the encoding-guard tests).
const invokedDirectly =
  process.argv[1] && /check-encoding\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  process.exit(main());
}
