import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  evaluateRemainder,
  loadPhrases,
  ownTickets,
} from "../check-pr-remainder.mjs";

// The real pull requests that closed their tickets with the rest unowned.
// Titles are verbatim from main; bodies are the sentences that said "partial".
const REAL = [
  {
    ticket: "RA-7026",
    remainder: "RA-8598",
    title:
      "RA-7026 Phase 2 (inc 1): contractor-facing assistant endpoint (dark by default) (#1899)",
    body: 'First increment of "Margot for contractors" -- a SEPARATE, read-only, tenant-scoped\nassistant surface.',
    branch: "feat/ra-7026-contractor-assistant",
  },
  {
    ticket: "RA-8494",
    remainder: "RA-8602",
    title: "RA-8494 part 1 of 2: technicians never see prices (#2685)",
    body: "Green and clean. Merged to clear the queue (user, 23/11).",
    branch: "ra-8494-tech-prices",
  },
  {
    ticket: "RA-8461",
    remainder: "RA-8613",
    title: "Mesh/phills mac mini/ra 8461 43692b33 (#2566)",
    body:
      "* RA-8461 slice 1: refuse portal tokens issued before a password change\n\n" +
      "Recovery itself (ticket criteria 1-3) is not in this slice.",
    branch: "mesh/phills-mac-mini/ra-8461-43692b33",
  },
  {
    ticket: "RA-8427",
    remainder: "RA-8614",
    title:
      "RA-8427 (slice 1): one registry of stored webhook event types, read by the Xero drain (#2557)",
    body:
      "Reversal handling itself is not in this change; payment.updated,\n" +
      "payment.deleted and invoice.deleted remain listed as open defects.",
    branch: "ra-8427-webhook-registry",
  },
];

// RA-8235: a first hand-written word list in the RA-8615 audit missed "part A".
const PART_A = {
  title:
    "feat(sketch): strictly validate AI floor plan reader output (RA-8235 part A) (#2514)",
  body: "Both readers now pass through one pure validator.",
  branch: "ra-8235-validate-ai-room-output",
};

for (const pr of REAL) {
  test(`${pr.ticket}: real partial PR fails without a Remainder line`, () => {
    const result = evaluateRemainder(pr);
    assert.equal(result.ok, false, result.message);
    assert.equal(result.partial, true);
    assert.match(result.message, /Remainder: RA-<number>/);
    assert.match(result.message, new RegExp(pr.ticket));
  });

  test(`${pr.ticket}: real partial PR passes with Remainder: ${pr.remainder}`, () => {
    const result = evaluateRemainder({
      ...pr,
      body: `${pr.body}\n\nRemainder: ${pr.remainder}\n`,
    });
    assert.equal(result.ok, true, result.message);
    assert.match(result.message, new RegExp(pr.remainder));
  });

  test(`${pr.ticket}: Remainder naming its own ticket fails`, () => {
    const result = evaluateRemainder({
      ...pr,
      body: `${pr.body}\n\nRemainder: ${pr.ticket}\n`,
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /own ticket/);
  });
}

test("RA-8235 'part A' is caught (the audit's first word list missed it)", () => {
  const result = evaluateRemainder(PART_A);
  assert.equal(result.ok, false);
  assert.match(result.message, /"part A"/);
  assert.equal(
    evaluateRemainder({ ...PART_A, body: `${PART_A.body}\nRemainder: RA-9999` })
      .ok,
    true,
  );
});

test("a normal pull request with none of the wording passes", () => {
  const result = evaluateRemainder({
    title: "RA-8463: palette A colours and light mode by default (#2567)",
    body: "Switches the default theme to light and updates the brand tokens. Tests cover both modes.",
    branch: "ra-8463-palette",
  });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.partial, false);
});

test("ordinary uses of nearby words do not trip it", () => {
  for (const body of [
    "The remaining balance is shown on the invoice.",
    "Deferred revenue is reported separately.",
    "Slice the array before sorting.",
    "This is part of the billing module.",
  ]) {
    const result = evaluateRemainder({
      title: "RA-1: tidy",
      body,
      branch: "ra-1",
    });
    assert.equal(result.partial, false, `tripped on: ${body}`);
  }
});

test("the Remainder line itself does not count as partial wording", () => {
  const result = evaluateRemainder({
    title: "RA-1: whole job",
    body: "Remainder: RA-2",
    branch: "ra-1",
  });
  assert.equal(result.partial, false);
});

test("own tickets come from title and branch, in RA-n, ra-n and 'ra n' forms", () => {
  assert.deepEqual(
    [...ownTickets("Mesh/x/ra 8461 abc", "mesh/x/ra-8461-abc")],
    ["8461"],
  );
  assert.deepEqual([...ownTickets("RA-1 and RA-2", "")].sort(), ["1", "2"]);
  // RA-849 must not be read out of RA-8494.
  assert.deepEqual([...ownTickets("RA-8494 part 1", "")], ["8494"]);
});

test("a Remainder line naming the title's ticket fails even when the branch has another", () => {
  const result = evaluateRemainder({
    title: "RA-10 slice 1",
    body: "Remainder: RA-11",
    branch: "ra-11-x",
  });
  assert.equal(result.ok, false);
});

test("the wording list is read from the one owner file", () => {
  const dir = mkdtempSync(join(tmpdir(), "ra8615-"));
  const file = join(dir, "phrases.json");
  writeFileSync(
    file,
    JSON.stringify({
      phrases: [{ id: "x", pattern: "\\bzebra\\b", flags: "i" }],
    }),
  );
  const phrases = loadPhrases(file);
  assert.equal(
    evaluateRemainder({ title: "RA-1 zebra", body: "" }, phrases).ok,
    false,
  );
  assert.equal(
    evaluateRemainder({ title: "RA-1 slice 1", body: "" }, phrases).ok,
    true,
  );
  writeFileSync(file, JSON.stringify({ phrases: [] }));
  assert.throws(() => loadPhrases(file), /no phrases/);
});
