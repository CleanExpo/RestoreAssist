---
name: jev-harness
description: Run, extend or read the RestoreAssist JEV harness: script-judged test families that call every API route in-process as each role and firm on a throwaway local database, plus the claim flow, photos, floor plans, CRM, payments, domain maths and attack payloads. Use when asked to "run the Jev tests", "test everything", add a test family, or explain a JEV verdict.
---

# JEV harness

Everything lives in `tests/eval/jev/` (README there has the file table). Verdicts are
script-judged and final. The Jev model only groups failures, and it is DISABLED until
its spend is approved.

## Run

```bash
npm run jev:control                 # the verdict script's own planted self-test; must print CONTROL OK
npm run jev:det                     # fresh throwaway Postgres, every family, then the verdict
npm run jev:det -- --family J3      # one family (partial run; never rewrites floors)
npm run jev:triage                  # out/triage.md: FAIL/INCONCLUSIVE clusters, advisory
```

To iterate on one family without a fresh database each time:
`tests/eval/jev/runner/db-up.sh`, then `tests/eval/jev/runner/dev-run.sh tests/eval/jev/families/j3.jev.test.ts`,
then `node tests/eval/jev/runner/aggregate.mjs --family J3`. Remove the container with
`docker rm -f ra-jev-pg` when finished.

Mac hooks refuse command lines containing "prisma" or "psql" and multiline git commands:
use the scripts above, which wrap them.

## Rules

1. **Synthetic only.** `runner/world.ts` builds two fake firms. Never point a family at a
   database that is not local; `config/vitest.db-guard.ts` refuses it anyway.
2. **No network.** `runner/setup.ts` refuses every non-local host and counts refusals.
   A result explained by a refused provider is INCONCLUSIVE ("needs provider"), never PASS
   and never FAIL.
3. **Controls first.** Every family has at least 3 planted defects (`kind: "control"`).
   Plant the defect, watch the family's own oracle FAIL it, then aim the oracle at the
   product. A control that passes is BROKEN_CHECK and fails the run.
4. **Never weaken an oracle to turn a product red green.** Fix the product, or list the case
   in `known-gaps/<FAMILY>.json` with a reason (it then reads KNOWN_GAP).
5. **Report what was not touched.** JEV calls route handlers; it does not click through the
   UI, run the mobile app, or reach Cloudinary, Stripe, Xero or AI providers. Say so.

## Adding a family

Copy `families/j1.jev.test.ts` and `families/j1/planted.ts`. Add the family to
`families.json` with an `expected_cases` floor from its first measured run and
`hard_gate: false` until its baseline reds are fixed or listed. Agents for this:
`.claude/agents/jev-generator.md` (writes a family), `jev-runner.md` (runs and reads the
verdict), `jev-triage.md` (turns clusters into fix tickets).
