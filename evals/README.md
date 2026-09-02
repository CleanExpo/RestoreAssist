# Agent evals

Regression tests for the agent's own configuration.

## Why this exists

`.claude/` holds 62 skills, 33 rules in `RULES.md`, two always-on rule files,
eight slash commands, four subagents and a Stop-hook verifier. That configuration
steers every session in this repository, and until now nothing tested any of it.

A skill edit that stops the skill triggering is invisible. So is a rule that gets
reworded into vagueness, or a hook that silently stops firing — which is not
hypothetical: both `PreToolUse` guards in this repo printed `BLOCKED` and allowed
the command through, for as long as they existed, until an eval-shaped check went
looking. Code gets regression tests. The configuration that writes the code does
not, and that asymmetry is the gap this closes.

## What an eval is here

One JSON file: a prompt, and checks that define an acceptable answer.

```json
{
  "id": "regulatory-year-from-registry",
  "prompt": "...",
  "checks": [
    { "kind": "must_not_match", "pattern": "...", "why": "..." }
  ]
}
```

`evals/check.sh` applies the checks to the agent's output and reports pass or
fail per case. The checks are deterministic — regexes and file assertions, no
model judging another model's answer — because a grader that is itself a model
fails in correlated ways with the thing it is grading, and this suite exists to
catch exactly the failures a model would not notice in itself.

## Seeded from real defects, not invented ones

Every case in this suite is a mistake that actually happened in this repository,
with a known correct outcome. That matters: a case invented to look hard tends to
test the author's imagination, while a case taken from a defect tests the thing
that actually went wrong once.

| Case | The original defect |
| --- | --- |
| `regulatory-year-from-registry` | `pre-1990` asbestos threshold hardcoded in four files, two of them safety-critical. A 1995 building produced a SWMS with no asbestos hazard on it. |
| `jurisdiction-aware-threshold` | A New Zealand job judged by Australia's asbestos year, and separately a NZ job told to notify SafeWork NSW. |
| `baseline-ratchets-down-only` | `--update-baseline` run against a NEW violation, which silences the gate instead of passing it. Caught one step before it happened. |
| `assertion-matches-the-property` | Three tests whose assertions were blunter than the property they checked — one forbade the word `prohibit` and failed on the entry's own "not a prohibition" disclaimer. |
| `hook-must-actually-block` | Two `PreToolUse` guards that printed `BLOCKED` and exited 1, which does not block. |
| `no-padded-effective-from` | `effectiveFrom` padded to `YYYY-MM-01` for entries whose day was never established, asserting a commencement date nobody verified. |
| `states-the-basis-not-the-verdict` | Completion claims that outran their evidence — `.claude/rules/verification-gate.md` exists because of this. |

## Running them

```bash
bash evals/check.sh                 # every case, against a recorded fixture
bash evals/check.sh --live          # every case, calling the agent for real
bash evals/check.sh --case <id>     # one case
```

`--live` needs an agent to call and costs whatever that agent costs. Without it
the suite runs against `evals/fixtures/<id>.txt`, which makes the CHECKS
testable without making the whole suite a network call — and a check that has
never been observed failing has not been shown to guard anything.

Each case therefore ships with two fixtures:

- `fixtures/<id>.pass.txt` — an answer that should pass.
- `fixtures/<id>.fail.txt` — an answer exhibiting the original defect, which
  MUST fail. If it passes, the check is not testing what it claims to.

`check.sh` runs both by default and reports a case as broken if the failing
fixture passes. That is the dead-check, built in.

## Adding a case

Add one when a mistake happens twice, or once with real consequences. Write the
`fail` fixture first, from the actual bad output, and confirm the check rejects
it before writing the `pass` fixture. A check written against only a good answer
usually accepts the bad one too.

## Where CI runs this

`.github/workflows/agent-evals.yml`, on any change to `CLAUDE.md`, `AGENTS.md`
or `.claude/**`, and nightly. The fixture mode needs no API key and no network,
so it runs on every such pull request at no cost.
