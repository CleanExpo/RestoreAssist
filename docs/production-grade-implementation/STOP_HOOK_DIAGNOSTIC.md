# Stop Hook Diagnostic

Date: 2026-05-25

## Error

Codex Stop hook failed with exit code `127`.

Exact failing command:

```sh
'/Users/phill-mac/RestoreAssist/.codex/hooks/stop-verifier.sh'
```

Shell reproduction:

```sh
sh -c "'/Users/phill-mac/RestoreAssist/.codex/hooks/stop-verifier.sh'"
```

Result:

```text
sh: /Users/phill-mac/RestoreAssist/.codex/hooks/stop-verifier.sh: No such file or directory
```

## Cause

`.codex/hooks.json` referenced a stale absolute path under `/Users/phill-mac/RestoreAssist`. The current machine and repository path use `/Users/phillmcgurk`, and the clean Phase 1 worktree is `/private/tmp/RestoreAssist-phase1-main`.

The verifier script itself exists and is executable at:

- `.codex/hooks/stop-verifier.sh`
- `.claude/hooks/stop-verifier.sh`

The hook dependencies checked during diagnosis:

- `bash`: present
- `zsh`: present
- `node`: present
- `pnpm`: present
- `jq`: present
- `gh`: present
- `codex`: present
- `rg`: not present on PATH, but the Stop verifier does not depend on `rg`

## Fix

Replaced the stale absolute Stop hook command with a relative command:

```sh
bash .codex/hooks/stop-verifier.sh
```

This keeps the hook portable when Codex runs hooks from the project root.

The same one-line hook config fix was applied to:

- `/private/tmp/RestoreAssist-phase1-main/.codex/hooks.json`
- `/Users/phillmcgurk/RestoreAssist/.codex/hooks.json`

No RestoreAssist application code was modified.

## Verification

The fixed command was validated from the clean worktree:

```sh
bash .codex/hooks/stop-verifier.sh
printf '{}' | bash .codex/hooks/stop-verifier.sh
jq empty .codex/hooks.json
```

All checks exited `0`.

## Next Action

Continue Phase 1 only from `/private/tmp/RestoreAssist-phase1-main` on `codex/phase-1-production-readiness-clean`. If Codex prompts to re-trust the changed Stop hook command because its trusted hash changed, approve `bash .codex/hooks/stop-verifier.sh`.

## Second-stage Diagnostic

The Stop hook was reported as still failing with exit code `127` after commit `7c5e1481`, which used:

```sh
"${CLAUDE_PROJECT_DIR:-$PWD}/.codex/hooks/stop-verifier.sh"
```

Current active hook config files were re-read:

- `/private/tmp/RestoreAssist-phase1-main/.codex/hooks.json`
- `/Users/phillmcgurk/RestoreAssist/.codex/hooks.json`

Both now contain:

```sh
bash .codex/hooks/stop-verifier.sh
```

Manual checks from `/private/tmp/RestoreAssist-phase1-main`:

```sh
sh -c '"${CLAUDE_PROJECT_DIR:-$PWD}/.codex/hooks/stop-verifier.sh"'
bash .codex/hooks/stop-verifier.sh
./.codex/hooks/stop-verifier.sh
CLAUDE_PROJECT_DIR=/private/tmp/RestoreAssist-phase1-main sh -c '"${CLAUDE_PROJECT_DIR:-$PWD}/.codex/hooks/stop-verifier.sh"'
```

All exited `0`. This confirms shell expansion works, Codex-style project-root execution works when the working directory is the repo root, and the verifier script itself is executable.

The stale absolute command still appears only in historical Codex session/log records and the old trusted hook state entry points at:

```text
/Users/phillmcgurk/RestoreAssist/.codex/hooks.json:stop:0:0
```

Conclusion: if the Stop hook still exits `127`, Codex is using the hook definition loaded before the file edit, or it needs the modified hook command to be re-trusted/reloaded. The on-disk hook config is no longer the old absolute path.

Manual action required if the next Stop still fails:

1. Restart or reload the current Codex session so hooks are re-read from `.codex/hooks.json`.
2. If prompted to trust the changed hook, approve only:

```sh
bash .codex/hooks/stop-verifier.sh
```

3. Continue from `/private/tmp/RestoreAssist-phase1-main`, not the original dirty checkout.
