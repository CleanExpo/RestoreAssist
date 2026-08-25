# Verification Controls

A check you have only ever seen pass has not been tested. It has been *observed*.

> **Golden rule: before you report a result, make the check produce the opposite result on purpose.**
> A gate that has never been seen to go red is not a gate. An absence that has never
> been seen to become a presence is not a measurement.

This skill exists because RestoreAssist has lost whole days to results that were
technically accurate and completely misleading. Every example below is real and
dated, from this repository.

## Load this when you are about to

- report that a check, gate, test, guard or scan **passed**
- report that something is **absent** — no matches, no findings, zero results, empty list
- claim a fix **works**, or that a bug **is not present**
- trust a build, cache, baseline or lockfile artefact you did not just regenerate

## Shape A — a green that is not structurally capable of going red

The check ran. It reported success. It could not have reported anything else.

| Instance | Why the green was worthless |
| --- | --- |
| `next.config.mjs` `typescript.ignoreBuildErrors: true` (UNI-2618) | The build was configured not to look. |
| `tsconfig.json` `incremental: true` (RA-7363) | `type-check` trusted `tsconfig.tsbuildinfo`. Two type errors reached `main` because the author's local run reused a cache. CI has no cache and found them after merge. |
| `check:no-lucide` baseline raised 0 → 356 → 357 (RA-7360) | The ratchet was widened to swallow the violations instead of the imports being removed. |
| Image entrypoint assertion (PR #2046) | `entrypoint.sh` prints its banner immediately **before** `exec node server.js`. A missing `server.js` still printed the banner, so the grep passed on a container that could not serve a request. |
| Publish provenance gate (PR #2048) | It called a module whose `main()` runs an unconditional `git fetch origin`. The repo is public, so the anonymous fetch succeeded and the gate passed for a reason unrelated to its own logic. |

**The tell:** you cannot describe, concretely, an input that would make this check fail.
If you cannot, you have not got a check.

## Shape B — silence read as a measurement

The tool never ran, or ran against nothing. Its quiet output was read as a verdict.

| Instance | What the silence actually meant |
| --- | --- |
| `Secrets scan` step, 2026-08-25 | `curl` exit 35 fetching the gitleaks tarball. **gitleaks was never downloaded.** The step went red, which looked like a scan verdict; nothing was scanned. |
| SWMS mutation control | The script matched `// -- 1. Carpet removal`; the file contained box-drawing `// ── 1.`. Nothing was mutated. The suite passed *for the wrong reason*. |
| `cloneRow` mutation control | The mutation was syntactically invalid, so the file failed to load. `114 passed, 0 failed` with a non-zero exit looked like a caught bug. |
| DNS check for RA-6955 | Four `dig` queries returned empty. `dig` was **not installed**. Empty was not "no records". |
| Linear board query | `list_issues(updatedAt: "P1D")` returned `[]`, which read as a dead integration. Dropping the filter returned everything. |

**The tell:** a zero, an empty list, or a clean exit that you did not first prove
*could* have been non-zero.

## Shape C — same command, different answer depending on where it ran

| Instance | The divergence |
| --- | --- |
| `.npmrc` missing from the Docker deps layer (PR #2046) | `npm ci` died on ERESOLVE inside the image and succeeded on the CI runner, which read the repo `.npmrc` (`legacy-peer-deps=true`). |
| Dual lockfile (RA-7359) | `pnpm.overrides` carries 38 pins; npm `overrides` carries 0. Production installs with npm, so none of those pins applied where customers are served. |

**The tell:** you verified in one environment and are reporting for another.

## The protocol

1. **Prove the negative.** Break the thing the check exists to catch — a deliberate
   type error in an untouched file, a removed `COPY`, a reverted guard — and confirm
   the check goes red. Restore, then run it clean.
2. **Prove the positive.** For any "not found", make it find something. A control
   query that returns a known-present result establishes the probe works.
3. **Read the output, not the exit code.** An exit code tells you a process ended.
   The log tells you what it did. A step that completes in 0 seconds, or reports
   `N passed` with no failing test, did not do what you think.
4. **Name the environment.** Say where you ran it. If production or CI differs from
   here, say that the claim does not transfer.
5. **Never widen a baseline to get green.** Raising a ratchet to absorb a violation is
   the same move as deleting a failing test. If it is genuinely the right call, record
   it as a decision — do not let it arrive as a silent tick.

## When the control does not fire

**Stop. Do not report the underlying result.** A control that fails to fire has told
you nothing about the code and everything about your instrument. Fix the instrument,
re-run, and only then read the result. Twice on 2026-08-25 a non-firing control was
nearly reported as proof.

## Reporting vocabulary

Label every claim so a reader can weigh it:

- **MEASURED** — command run, exit code observed, output read, control fired.
- **INFERRED** — deduced from something measured. Say from what.
- **ASSERTED** — believed, not checked. Say so plainly, or do not say it.

State what you did **not** check. An unobserved exit code was not observed.

## Related skills

- `ci-parity-verification` — the specific case of suites that skip locally and run in CI.
- `data-source-ssot` — two stores that silently disagree.
- `external-contract-verification` — mocked tests that stay green against a changed API.
