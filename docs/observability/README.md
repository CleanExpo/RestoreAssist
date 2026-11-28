# Observability for the agent itself

Stage 6 of the AI-native SDLC asks a question the earlier stages do not: **is the
agent still behaving the way we think it is?** Everything else in this repository
measures the code. This measures the sessions that write it.

## What is here, and what is not

| | State |
| --- | --- |
| A durable metric series | **Working.** `scripts/observability/verifier-ledger.jsonl` (frozen history, 786 verifications) plus one file per verification since in `scripts/observability/verifier-ledger.d/`. |
| Deterministic detection | **Working.** `scripts/observability/verifier-metrics.ts`, 24 tests. |
| Control bands and a tier ladder | **Defined.** `scripts/observability/bands.yaml`. |
| A trigger that invokes Claude on a breach | **Not wired.** See below. |
| OpenTelemetry export | **Not enabled.** Documented, opt-in, endpoint is the owner's call. |

The trigger layer is deliberately absent rather than forgotten. Wiring it means a
scheduled job with model access — a spend decision (rule 31) — and the `propose`
tier would let an agent open pull requests with nobody having started it. Both are
the owner's to authorise. The ladder is written down so that decision can be made
against something concrete.

## Reading the current position

```bash
npm run metrics:verifier            # report the position
npm run metrics:verifier -- --append   # absorb new reports into the ledger first
npm run metrics:verifier -- --json
```

It never exits non-zero on a breach. This reports a position; it is not a gate,
and turning an observability signal into a failing check is how people learn to
ignore it.

## The two metrics, and why they are judged differently

### `verifier_unavailable_rate` — a fixed threshold

The share of turns where the Stop-hook verifier could not run at all. On those
turns the LLM stage of the gate was **off**, and in any summary that counts only
failures that reads exactly like a clean pass.

This is a threshold, not a band, because a control that is off has no acceptable
background rate to be measured against. It needs no baseline and fires from the
first window, which is why it was the signal worth wiring first.

On 2026-11-22 it was **1.6%** (6 of 379), just under the 2% threshold; that is a
dated snapshot, so run `collect-verifier-metrics.ts` for the current rate. The usual cause is a
missing API key — `error_code: 4` in the report means none was found. The
resolution order is documented at the top of `.claude/hooks/lib/openrouter-call.sh`.

### `unbacked_claim_rate` — a control band with no baseline yet

The share of turns the verifier stopped because a claim about tests, CI or a build
was not backed by anything that had actually run. This is precisely the failure
`.claude/rules/verification-gate.md` exists to prevent, measured rather than
asserted. Both instances in the corpus read:

> "Asserted tests/CI/build pass without executing anything" — *No Bash tool call in
> this turn to produce the cited pass result.*

**The detector will not give you a band position for it, and that is the point.**
The corpus spans 116 days but holds only **six active days across four sessions**,
with 225 of the 379 reports on a single day. A rolling 30-day mean and standard
deviation over that is arithmetic, not evidence: most windows are empty, and the
resulting sigma describes when somebody happened to be working rather than how the
agent behaves. So `detect` returns `insufficient-data`, reports the raw rate as an
observation, and says how many windows it has.

Reporting a confident band breach off six days would be the same defect the
verifier itself catches.

## Why there is a ledger at all

`.claude/verifier-reports/` is in `.gitignore`. 151 files are tracked only because
they predate that rule, and **no new report will ever be committed** — so the
signal is discarded on every fresh clone, and a CI job would read a frozen,
months-old corpus. A control band needs a series that grows.

The ledger is therefore committed: one compact line per verification, carrying
only what the bands are computed from. No free text, no claim bodies, no file
paths — the reports contain absolute paths from contributors' machines, and those
stay out of the tree. Every entry is keyed on session, timestamp and domain, so
re-running is idempotent.

### Layout: one file per entry

| Path | Role |
| --- | --- |
| `scripts/observability/verifier-ledger.jsonl` | Frozen history. Read, never appended again. |
| `scripts/observability/verifier-ledger.d/<timestamp>-<domain>-<hash>.jsonl` | One verification each, one line. `<domain>` is the domain made safe for a file name and cut to 64 bytes, for a person to read. `<hash>` is what identifies the entry: 32 hex characters of a SHA-256 taken over the session, the timestamp and the untouched domain, so two domains that read alike once made safe (`a/b` and `a?b`) still get two files. The exact rule is at the top of `scripts/observability/ledger.ts`. Entries written before 28/11/2026 keep an older, shorter name; the reader goes by content, not by name. |

The ledger used to be the single `.jsonl` file, and every mesh branch appended to
it. Each branch therefore changed the same end of the same file, so whichever pull
request merged first left every other open one conflicting; resolving that pushed
a new head, which voided that PR's release receipt, and the PRs looped. With one
file per entry, two branches add two different files and git merges them without
asking.

Both producers — the Stop hook's `.claude/hooks/lib/ledger-append.sh` and
`collect-verifier-metrics.ts --append` — write the same line under the same
deterministic name, so the same event recorded twice overwrites one file rather
than adding a second. Every reader goes through `readLedger()` in
`scripts/observability/ledger.ts`, which reads the frozen file and then every
entry file, de-duplicated on session, timestamp and domain. Dotfiles (an entry
still being written) and anything not ending `.jsonl` are ignored, and a line
that is not a ledger record (unparsable, or valid JSON without a session,
timestamp, domain and status) is skipped, so one bad entry cannot stop the
reader.

What a report becomes in its line is one rule, set out at the top of
`ledger.ts` and followed by both producers: a verification that happened is
always recorded. The status is the report's `status` when that is text and
`unknown` otherwise, which covers a report that is valid JSON but not an object.
A claim count is kept only when it is a whole number from 0 to
9007199254740991. Any other value (null, text, a fraction, a number too large
to hold such as `1e400`) is left out, and the reader removes such a count from a
line already on disk instead of dropping the line. Both producers are held to
`scripts/observability/__tests__/ledger-report-vectors.json`.

Entry files are meant to be committed with the work that produced them, like the
old appended lines were.

## Three safeguards worth knowing about

Each exists because the naive version of this detector is actively misleading, and
each has a test that goes red when it is removed.

1. **Empty days are not filled in as zeros.** A day nobody worked is missing data,
   not a perfect score. Padding would drag the mean toward zero and make a genuine
   spike look ordinary.
2. **A large sigma count is not enough to escalate.** Sigma is a ratio, so a
   near-flat baseline turns a movement of half a percentage point into a
   six-sigma excursion. Escalation past `log` also requires the absolute rate to
   have moved by at least two percentage points.
3. **One bad turn cannot authorise a pull request.** The `propose` tier lets an
   agent open a PR unprompted. Against a clean baseline a single failure is
   arbitrarily many sigmas out, so a window needs at least three failures before
   the ladder goes past `diagnose`, which is read-only.

## OpenTelemetry

Claude Code can export session telemetry — token counts, tool calls, hook
decisions with their allow/block verdicts and timings. That is the source for most
of the playbook's "how to measure it" indicators, including time spent waiting at
each approval gate.

**It is not enabled here, and enabling it is an owner decision**, because it sends
session data to an external endpoint. That is data egress, and it is not something
an agent should switch on for you.

To enable it, set these in your own environment — not in a committed file, and not
in `.env.local` either, since the collector endpoint and any auth header belong
wherever your other infrastructure secrets live:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_ENDPOINT=https://<your-collector>
```

Before turning it on, decide two things:

- **Where it goes.** A self-hosted collector keeps prompts and file paths inside
  your own boundary. A third-party SaaS endpoint does not, and this repository's
  sessions routinely contain customer job data and regulatory content.
- **What is in it.** Session transcripts can carry more than metrics. Check what
  your exporter configuration actually forwards before pointing it anywhere.

The ledger above deliberately needs none of this. It works offline, commits to the
repo, and carries no free text — so the first metric is available without anyone
having to make the egress decision first.

## What would come next

In rough order of value:

1. **Let the ledger fill.** The band needs eight populated days and has six. This
   costs nothing but time, and until then any escalation would be noise.
2. **Have the Stop hook append to the ledger directly**, so the signal is captured
   at the point of production rather than swept up afterwards from a gitignored
   directory.
3. **Wire the trigger**, once the owner has made the spend and autonomy calls.
   `diagnose` writes an `intent.md` into `intent/` using the Stage 1 template,
   which is what closes the loop back to the start of the SDLC.
