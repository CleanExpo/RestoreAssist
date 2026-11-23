#!/usr/bin/env node
/**
 * A pull request that says it is partial work must name the ticket that owns
 * the rest (RA-8615).
 *
 * THE FAULT THIS EXISTS FOR
 * -------------------------
 * A pull request is linked to its Linear ticket by the number in its branch or
 * title, and the ticket closes when the pull request merges. Nothing asked
 * whether the pull request was the whole job. RA-7026, RA-8494, RA-8461 and
 * RA-8427 all closed as Done after their first slice merged, and the rest had
 * no owner until an audit found it by hand days later.
 *
 * THE RULE
 * --------
 * If the title or body matches any wording in partial-work-phrases.json (the
 * one list; this file and its tests read it), the body must carry a line
 *
 *   Remainder: RA-<number>
 *
 * naming a ticket that is not the one in the title or branch.
 *
 * LIMIT, STATED ON PURPOSE
 * ------------------------
 * No Linear credential and no network call. This check does NOT confirm the
 * remainder ticket exists, is open, or is in the right project. It proves only
 * that the author named a different ticket. Reopening a ticket closed on merge
 * is a Linear workspace setting, not code in this repository.
 *
 *   PR_TITLE=... PR_BODY=... PR_HEAD_REF=... node scripts/ci/check-pr-remainder.mjs
 *
 * Exit 0 = not partial, or partial with a valid Remainder line.
 * Exit 1 = partial without a valid Remainder line.
 * Exit 2 = the phrase file could not be read, which is never a pass.
 *
 * Node stdlib only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PHRASES_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "partial-work-phrases.json",
);

export function loadPhrases(file = PHRASES_FILE) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed.phrases) || parsed.phrases.length === 0) {
    throw new Error(`${file} has no phrases`);
  }
  return parsed.phrases.map((p) => ({
    id: p.id,
    regex: new RegExp(p.pattern, p.flags ?? ""),
  }));
}

const REMAINDER_LINE =
  /^[ \t]*[-*]?[ \t]*\**Remainder:?\**:?[ \t]*\[?RA-(\d+)\b/gim;

/** Ticket numbers the pull request belongs to: RA-123, ra-123, "ra 123" in title or branch. */
export function ownTickets(title = "", branch = "") {
  const own = new Set();
  for (const text of [title, branch]) {
    for (const m of String(text).matchAll(/\bRA[-_ ]?(\d+)\b/gi)) own.add(m[1]);
  }
  return own;
}

export function evaluateRemainder(
  { title = "", body = "", branch = "" },
  phrases = loadPhrases(),
) {
  // Remainder lines are the answer, not the question: drop them before scanning.
  const bodyWithoutRemainder = String(body).replace(REMAINDER_LINE, "");
  const text = `${title}\n${bodyWithoutRemainder}`;
  const hits = [];
  for (const { id, regex } of phrases) {
    const m = text.match(regex);
    if (m) hits.push({ id, matched: m[0] });
  }
  if (hits.length === 0) {
    return {
      ok: true,
      partial: false,
      message: "Not marked as partial work; no Remainder line needed.",
    };
  }

  const own = ownTickets(title, branch);
  const named = [...String(body).matchAll(REMAINDER_LINE)].map((m) => m[1]);
  const valid = named.filter((n) => !own.has(n));
  const said = hits.map((h) => `"${h.matched}"`).join(", ");
  const ownList = own.size
    ? [...own].map((n) => `RA-${n}`).join(", ")
    : "none found";

  if (valid.length > 0) {
    return {
      ok: true,
      partial: true,
      message: `Partial work (${said}); the rest is owned by ${valid.map((n) => `RA-${n}`).join(", ")}.`,
    };
  }

  const why = named.length
    ? `Its Remainder line names ${named.map((n) => `RA-${n}`).join(", ")}, which is this pull request's own ticket.`
    : "Its body has no Remainder line.";
  return {
    ok: false,
    partial: true,
    message:
      `This pull request says it is partial work (${said}). ${why}\n` +
      `Add this line to the pull request body, naming the open ticket that owns the rest of the work ` +
      `(not this pull request's own ticket: ${ownList}):\n\n` +
      `  Remainder: RA-<number>\n\n` +
      `Create that ticket before this merges, or the ticket closes on merge with the rest unowned.`,
  };
}

if (process.argv[1]?.endsWith("check-pr-remainder.mjs")) {
  let phrases;
  try {
    phrases = loadPhrases();
  } catch (error) {
    console.error(`Could not read partial-work phrases: ${error.message}`);
    process.exit(2);
  }
  const result = evaluateRemainder(
    {
      title: process.env.PR_TITLE,
      body: process.env.PR_BODY,
      branch: process.env.PR_HEAD_REF,
    },
    phrases,
  );
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}
