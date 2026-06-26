# Personal Local-Data Backup & Recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small, dependency-light CLI tool that backs up this Mac's irreplaceable local data (49 `.env` secret files → 1Password; expensive media → Google Drive) and restores it non-destructively.

**Architecture:** Two independent script pairs (`backup-/restore-secrets.sh`, `backup-/restore-media.sh`) sharing a `lib/` of pure, testable bash functions, driven by one `backup.config.json`. Secrets go to a dedicated 1Password vault via the `op` CLI; media syncs to Google Drive via `rclone copy` (additive). Tests are pure bash with PATH stub shims for `op`/`rclone`, so the whole suite runs offline.

**Tech Stack:** bash 3.2 (macOS system bash), `jq` (config), `op` (1Password CLI, installed), `rclone` (installed during setup, no Homebrew), a hand-rolled bash assertion harness.

## Global Constraints

- **bash 3.2 compatible** — NO associative arrays, NO `mapfile`/`readarray`, NO `${var^^}`/`${var,,}`. Use indexed arrays, `while read` loops, `tr`.
- **macOS BSD tools** — `find`, `stat`, `sed` are BSD variants; use portable flags only.
- **No Homebrew available** — install `rclone` via its official script; the test framework is vendored pure-bash (no `bats`).
- **Scripts contain NO secrets** — safe to commit. Secret *values* live only in 1Password.
- **Every script supports `--dry-run`** (plan only, no changes) and is **non-destructive on restore** without `--force`.
- **All scripts start with** `set -euo pipefail`.
- **1Password vault name:** `Local-Env-Backups`. **Google Drive remote name:** `gdrive`. **Drive destination root:** `gdrive:Backups/<hostname>/`.
- **Tool root:** `scripts/local-backup/` inside the RestoreAssist repo.
- Commit after every task with a `feat:`/`test:`/`docs:` message.

---

## File Structure

```
scripts/local-backup/
├── backup.config.json          # what to back up (declarative)
├── lib/
│   ├── common.sh               # logging, config getters, arg parsing, hostname
│   ├── secrets.sh              # discover_env_files, env_path_to_title, title_to_env_path
│   └── media.sh                # media_dest mapping
├── backup-secrets.sh           # gather .env files -> 1Password (idempotent)
├── restore-secrets.sh          # 1Password -> .env files (non-destructive)
├── backup-media.sh             # rclone copy media folders -> Drive
├── restore-media.sh            # rclone copy Drive -> media folders
├── README.md                   # setup + usage + disaster-recovery runbook
└── tests/
    ├── assert.sh               # assertion functions
    ├── run-tests.sh            # runner: executes every test_*.sh, aggregates
    ├── stubs/
    │   ├── op                  # fake 1Password CLI (stateful, file-backed)
    │   └── rclone              # fake rclone (records invocation args)
    ├── test_common.sh
    ├── test_discovery.sh
    ├── test_title_mapping.sh
    ├── test_secrets_backup.sh
    ├── test_secrets_restore.sh
    └── test_media.sh
```

---

## Task 1: Scaffolding — config, common lib, test harness

**Files:**
- Create: `scripts/local-backup/backup.config.json`
- Create: `scripts/local-backup/lib/common.sh`
- Create: `scripts/local-backup/tests/assert.sh`
- Create: `scripts/local-backup/tests/run-tests.sh`
- Test: `scripts/local-backup/tests/test_common.sh`

**Interfaces:**
- Produces:
  - `backup.config.json` with keys `.secrets.vault`, `.secrets.roots[]`, `.secrets.includeGlobs[]`, `.secrets.excludeGlobs[]`, `.secrets.excludePaths[]`, `.media.remote`, `.media.destPrefix`, `.media.folders[]`.
  - `common.sh` sourceable; sets `LB_DIR` (the `local-backup` dir), `CONFIG` (path to config); functions `log(msg)`, `die(msg)` (stderr + exit 1), `cfg_str(jqfilter)` → echoes one string, `cfg_list(jqfilter)` → echoes newline-separated values, `lb_hostname()` → echoes `${LB_HOSTNAME:-$(hostname -s)}`.
  - `assert.sh` functions: `assert_eq(actual,expected,name)`, `assert_contains(haystack,needle,name)`, `assert_file(path,name)`, `assert_nofile(path,name)`, `assert_ok(name)`/`assert_fail(name)` wrappers via `$?`, and `assert_finish()` (prints summary, returns nonzero if any failed).

- [ ] **Step 1: Write the failing test** — `scripts/local-backup/tests/test_common.sh`

```bash
#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"
. "$DIR/../lib/common.sh"

assert_eq "$(cfg_str '.secrets.vault')" "Local-Env-Backups" "vault name from config"
assert_contains "$(cfg_list '.secrets.includeGlobs[]')" ".env" "includeGlobs has .env"
LB_HOSTNAME="testbox" assert_eq "$(LB_HOSTNAME=testbox lb_hostname)" "testbox" "hostname override"

assert_finish
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts/local-backup && bash tests/test_common.sh`
Expected: FAIL — `assert.sh`/`common.sh` not found (No such file or directory).

- [ ] **Step 3: Create the config** — `scripts/local-backup/backup.config.json`

```json
{
  "secrets": {
    "vault": "Local-Env-Backups",
    "roots": ["~"],
    "includeGlobs": [".env", ".env.*"],
    "excludeGlobs": ["*.example", "*.sample", "*.template"],
    "excludePaths": ["node_modules", "Library", ".Trash"]
  },
  "media": {
    "remote": "gdrive",
    "destPrefix": "Backups",
    "folders": [
      "RestoreAssist/public/videos/remotion"
    ]
  }
}
```

- [ ] **Step 4: Create the common lib** — `scripts/local-backup/lib/common.sh`

```bash
# Sourced by all scripts. Requires: jq.
LB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${LB_CONFIG:-$LB_DIR/backup.config.json}"

log() { printf '%s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cfg_str()  { jq -r "$1" "$CONFIG"; }
cfg_list() { jq -r "$1" "$CONFIG"; }

lb_hostname() { printf '%s\n' "${LB_HOSTNAME:-$(hostname -s)}"; }
```

- [ ] **Step 5: Create the assertion harness** — `scripts/local-backup/tests/assert.sh`

```bash
# Pure-bash assertions. Source after set -uo pipefail.
ASSERT_RUN=0; ASSERT_FAIL=0
assert_eq() {
  ASSERT_RUN=$((ASSERT_RUN+1))
  if [ "$1" != "$2" ]; then ASSERT_FAIL=$((ASSERT_FAIL+1)); printf 'FAIL %s: expected [%s] got [%s]\n' "$3" "$2" "$1"; fi
}
assert_contains() {
  ASSERT_RUN=$((ASSERT_RUN+1))
  case "$1" in *"$2"*) ;; *) ASSERT_FAIL=$((ASSERT_FAIL+1)); printf 'FAIL %s: [%s] missing [%s]\n' "$3" "$1" "$2";; esac
}
assert_file()   { ASSERT_RUN=$((ASSERT_RUN+1)); [ -f "$1" ] || { ASSERT_FAIL=$((ASSERT_FAIL+1)); printf 'FAIL %s: no file %s\n' "$2" "$1"; }; }
assert_nofile() { ASSERT_RUN=$((ASSERT_RUN+1)); [ ! -f "$1" ] || { ASSERT_FAIL=$((ASSERT_FAIL+1)); printf 'FAIL %s: unexpected file %s\n' "$2" "$1"; }; }
assert_finish() {
  printf 'ran=%d failed=%d\n' "$ASSERT_RUN" "$ASSERT_FAIL"
  [ "$ASSERT_FAIL" -eq 0 ]
}
```

- [ ] **Step 6: Create the runner** — `scripts/local-backup/tests/run-tests.sh`

```bash
#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
fails=0
for t in "$DIR"/test_*.sh; do
  printf '== %s ==\n' "$(basename "$t")"
  bash "$t" || fails=$((fails+1))
done
printf '\n==== %d test file(s) failed ====\n' "$fails"
[ "$fails" -eq 0 ]
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd scripts/local-backup && bash tests/test_common.sh`
Expected: `ran=3 failed=0` and exit 0.

- [ ] **Step 8: Commit**

```bash
git add scripts/local-backup/backup.config.json scripts/local-backup/lib/common.sh scripts/local-backup/tests/assert.sh scripts/local-backup/tests/run-tests.sh scripts/local-backup/tests/test_common.sh
git commit -m "feat(backup): scaffold config, common lib, and bash test harness"
```

---

## Task 2: Env-file discovery

**Files:**
- Create: `scripts/local-backup/lib/secrets.sh`
- Test: `scripts/local-backup/tests/test_discovery.sh`

**Interfaces:**
- Consumes: `cfg_list` from `common.sh`; config keys `.secrets.roots[]`, `.secrets.includeGlobs[]`, `.secrets.excludeGlobs[]`, `.secrets.excludePaths[]`.
- Produces: `discover_env_files()` → prints absolute paths (one per line) of matching files. Honors `~` expansion in roots. Prunes `excludePaths` directories. Matches `includeGlobs` by basename, rejects `excludeGlobs` by basename.

- [ ] **Step 1: Write the failing test** — `scripts/local-backup/tests/test_discovery.sh`

```bash
#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"
. "$DIR/../lib/common.sh"
. "$DIR/../lib/secrets.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/proj/node_modules" "$TMP/proj/sub"
printf 'A=1\n'  > "$TMP/proj/.env"
printf 'B=2\n'  > "$TMP/proj/.env.local"
printf 'C=3\n'  > "$TMP/proj/.env.example"
printf 'D=4\n'  > "$TMP/proj/node_modules/.env"
printf 'E=5\n'  > "$TMP/proj/sub/.env.production"

OUT="$(LB_ROOTS_OVERRIDE="$TMP" discover_env_files | sort)"
assert_contains "$OUT" "$TMP/proj/.env" "finds .env"
assert_contains "$OUT" "$TMP/proj/.env.local" "finds .env.local"
assert_contains "$OUT" "$TMP/proj/sub/.env.production" "finds nested .env.production"
case "$OUT" in *".env.example"*) echo "FAIL: example not excluded"; exit 1;; esac
case "$OUT" in *"node_modules"*) echo "FAIL: node_modules not pruned"; exit 1;; esac

assert_finish
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts/local-backup && bash tests/test_discovery.sh`
Expected: FAIL — `secrets.sh` not found / `discover_env_files: command not found`.

- [ ] **Step 3: Implement discovery** — `scripts/local-backup/lib/secrets.sh`

```bash
# Sourced after common.sh. Provides secret-file discovery + path<->title mapping.

# Expand a leading ~ to $HOME.
_expand_tilde() {
  case "$1" in
    "~") printf '%s\n' "$HOME" ;;
    "~/"*) printf '%s\n' "$HOME/${1#~/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

discover_env_files() {
  local roots=() includes=() excludes=() prunes=()
  if [ -n "${LB_ROOTS_OVERRIDE:-}" ]; then
    roots=("$LB_ROOTS_OVERRIDE")
  else
    while IFS= read -r r; do roots+=("$(_expand_tilde "$r")"); done < <(cfg_list '.secrets.roots[]')
  fi
  while IFS= read -r g; do includes+=("$g"); done < <(cfg_list '.secrets.includeGlobs[]')
  while IFS= read -r g; do excludes+=("$g"); done < <(cfg_list '.secrets.excludeGlobs[]')
  while IFS= read -r p; do prunes+=("$p"); done < <(cfg_list '.secrets.excludePaths[]')

  # Build find predicate arrays.
  local prune_expr=() inc_expr=() exc_expr=()
  local first=1 p g
  for p in "${prunes[@]}"; do
    if [ "$first" -eq 1 ]; then prune_expr+=( -name "$p" ); first=0
    else prune_expr+=( -o -name "$p" ); fi
  done
  first=1
  for g in "${includes[@]}"; do
    if [ "$first" -eq 1 ]; then inc_expr+=( -name "$g" ); first=0
    else inc_expr+=( -o -name "$g" ); fi
  done
  for g in "${excludes[@]}"; do exc_expr+=( ! -name "$g" ); done

  local root
  for root in "${roots[@]}"; do
    [ -d "$root" ] || continue
    find "$root" \
      \( -type d \( "${prune_expr[@]}" \) -prune \) -o \
      \( -type f \( "${inc_expr[@]}" \) "${exc_expr[@]}" -print \)
  done
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd scripts/local-backup && bash tests/test_discovery.sh`
Expected: `ran=3 failed=0`, exit 0 (the two `case` guards print nothing).

- [ ] **Step 5: Commit**

```bash
git add scripts/local-backup/lib/secrets.sh scripts/local-backup/tests/test_discovery.sh
git commit -m "feat(backup): add .env file discovery with prune/include/exclude rules"
```

---

## Task 3: Path ↔ title mapping

**Files:**
- Modify: `scripts/local-backup/lib/secrets.sh` (append two functions)
- Test: `scripts/local-backup/tests/test_title_mapping.sh`

**Interfaces:**
- Produces:
  - `env_path_to_title(abspath)` → echoes the `$HOME`-relative path (e.g. `/Users/me/RestoreAssist/.env.local` → `RestoreAssist/.env.local`). Paths already relative are returned unchanged.
  - `title_to_env_path(title)` → echoes `$HOME/<title>`.

- [ ] **Step 1: Write the failing test** — `scripts/local-backup/tests/test_title_mapping.sh`

```bash
#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"
. "$DIR/../lib/common.sh"
. "$DIR/../lib/secrets.sh"

HOME_BAK="$HOME"; export HOME="/Users/tester"
assert_eq "$(env_path_to_title "/Users/tester/RestoreAssist/.env.local")" "RestoreAssist/.env.local" "abs->title"
assert_eq "$(title_to_env_path "RestoreAssist/.env.local")" "/Users/tester/RestoreAssist/.env.local" "title->abs"
assert_eq "$(env_path_to_title "$(title_to_env_path "Synthex/.env")")" "Synthex/.env" "round trip"
export HOME="$HOME_BAK"

assert_finish
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts/local-backup && bash tests/test_title_mapping.sh`
Expected: FAIL — `env_path_to_title: command not found`.

- [ ] **Step 3: Append the mapping functions** to `scripts/local-backup/lib/secrets.sh`

```bash
env_path_to_title() {
  local p="$1"
  case "$p" in
    "$HOME/"*) printf '%s\n' "${p#"$HOME"/}" ;;
    *) printf '%s\n' "$p" ;;
  esac
}

title_to_env_path() {
  printf '%s\n' "$HOME/$1"
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd scripts/local-backup && bash tests/test_title_mapping.sh`
Expected: `ran=3 failed=0`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/local-backup/lib/secrets.sh scripts/local-backup/tests/test_title_mapping.sh
git commit -m "feat(backup): add HOME-relative path<->1Password title mapping"
```

---

## Task 4: Secrets backup (idempotent → 1Password)

**Files:**
- Create: `scripts/local-backup/backup-secrets.sh`
- Create: `scripts/local-backup/tests/stubs/op`
- Test: `scripts/local-backup/tests/test_secrets_backup.sh`

**Interfaces:**
- Consumes: `discover_env_files`, `env_path_to_title`, `cfg_str`, `log`, `die`.
- Produces: executable `backup-secrets.sh` supporting `--dry-run`. Behavior:
  1. Preflight: `op whoami` must succeed, else `die`.
  2. Ensure vault exists: `op vault get "$VAULT"` or `op vault create "$VAULT"`.
  3. For each discovered file: if `op item get "<title>" --vault "$VAULT"` succeeds → `op document edit "<title>" "<file>" --vault "$VAULT"`; else → `op document create "<file>" --title "<title>" --vault "$VAULT" --tags "<project>"`.
  4. Print a summary `created=N updated=M`. `--dry-run` prints the plan and makes no `op` write calls.
- Stub `op` contract (file-backed state under `$OP_STUB_DIR`): supports `whoami`, `vault get|create`, `item get`, `document create|edit|get`, `item list --format=json`. Title slashes encoded as `%2F` for on-disk filenames.

- [ ] **Step 1: Write the stub op** — `scripts/local-backup/tests/stubs/op`

```bash
#!/usr/bin/env bash
# Minimal stateful fake of the 1Password CLI for tests.
# State dir: $OP_STUB_DIR (vault docs stored as files; title slashes -> %2F).
set -uo pipefail
STATE="${OP_STUB_DIR:?OP_STUB_DIR must be set}"
mkdir -p "$STATE"
enc() { printf '%s\n' "$1" | sed 's#/#%2F#g'; }
dec() { printf '%s\n' "$1" | sed 's#%2F#/#g'; }
# crude flag extractor: --flag value
flagval() { local want="$1"; shift; while [ $# -gt 0 ]; do [ "$1" = "$want" ] && { printf '%s\n' "$2"; return; }; shift; done; }

cmd="${1:-}"; sub="${2:-}"
case "$cmd" in
  whoami) echo "stub-user"; exit 0 ;;
  vault)
    name="${3:-}"
    case "$sub" in
      get)    [ -d "$STATE/$(enc "$name")" ] && exit 0 || { echo "no vault" >&2; exit 1; } ;;
      create) mkdir -p "$STATE/$(enc "$name")"; exit 0 ;;
    esac ;;
  item)
    case "$sub" in
      get)   title="$3"; v="$(flagval --vault "$@")"; [ -f "$STATE/$(enc "$v")/$(enc "$title")" ] && exit 0 || { echo "not found" >&2; exit 1; } ;;
      list)  v="$(flagval --vault "$@")"; printf '['; first=1
             if [ -d "$STATE/$(enc "$v")" ]; then
               for f in "$STATE/$(enc "$v")"/*; do
                 [ -e "$f" ] || continue
                 t="$(dec "$(basename "$f")")"
                 [ "$first" -eq 1 ] || printf ','; first=0
                 printf '{"title":"%s"}' "$t"
               done
             fi
             printf ']\n' ;;
    esac ;;
  document)
    case "$sub" in
      create) file="$3"; title="$(flagval --title "$@")"; v="$(flagval --vault "$@")"
              mkdir -p "$STATE/$(enc "$v")"; cp "$file" "$STATE/$(enc "$v")/$(enc "$title")"; exit 0 ;;
      edit)   title="$3"; file="$4"; v="$(flagval --vault "$@")"
              cp "$file" "$STATE/$(enc "$v")/$(enc "$title")"; exit 0 ;;
      get)    title="$3"; v="$(flagval --vault "$@")"; cat "$STATE/$(enc "$v")/$(enc "$title")" ;;
    esac ;;
  *) echo "stub op: unhandled '$cmd $sub'" >&2; exit 2 ;;
esac
```

- [ ] **Step 2: Write the failing test** — `scripts/local-backup/tests/test_secrets_backup.sh`

```bash
#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export OP_STUB_DIR="$TMP/opstate"
export PATH="$DIR/stubs:$PATH"          # stub op shadows real op
export HOME="$TMP/home"
mkdir -p "$HOME/proj"
printf 'A=1\n' > "$HOME/proj/.env"
printf 'B=2\n' > "$HOME/proj/.env.local"
export LB_ROOTS_OVERRIDE="$HOME"

# First run: two creates.
OUT1="$(bash "$DIR/../backup-secrets.sh")"
assert_contains "$OUT1" "created=2" "first run creates 2"
assert_file "$OP_STUB_DIR/Local-Env-Backups/proj%2F.env" "doc stored for .env"

# Second run: idempotent, two updates, no new files beyond the two.
OUT2="$(bash "$DIR/../backup-secrets.sh")"
assert_contains "$OUT2" "updated=2" "second run updates 2"
COUNT="$(ls -1 "$OP_STUB_DIR/Local-Env-Backups" | wc -l | tr -d ' ')"
assert_eq "$COUNT" "2" "no duplicate items"

# Dry run on a fresh vault writes nothing.
rm -rf "$OP_STUB_DIR"
OUT3="$(bash "$DIR/../backup-secrets.sh" --dry-run)"
assert_contains "$OUT3" "DRY-RUN" "dry-run announces"
assert_nofile "$OP_STUB_DIR/Local-Env-Backups/proj%2F.env" "dry-run writes nothing"

assert_finish
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd scripts/local-backup && bash tests/test_secrets_backup.sh`
Expected: FAIL — `backup-secrets.sh` not found.

- [ ] **Step 4: Implement** — `scripts/local-backup/backup-secrets.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
LB_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$LB_DIR/lib/common.sh"
. "$LB_DIR/lib/secrets.sh"

DRY_RUN=0
for a in "$@"; do case "$a" in --dry-run) DRY_RUN=1 ;; *) die "unknown arg: $a" ;; esac; done

VAULT="$(cfg_str '.secrets.vault')"

op whoami >/dev/null 2>&1 || die "Not signed in to 1Password. Run: eval \$(op signin)"

if [ "$DRY_RUN" -eq 1 ]; then log "DRY-RUN: no changes will be written."; fi

if [ "$DRY_RUN" -eq 0 ]; then
  op vault get "$VAULT" >/dev/null 2>&1 || op vault create "$VAULT" >/dev/null
fi

created=0; updated=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  title="$(env_path_to_title "$f")"
  project="${title%%/*}"
  if op item get "$title" --vault "$VAULT" >/dev/null 2>&1; then
    if [ "$DRY_RUN" -eq 1 ]; then log "would UPDATE $title"; else op document edit "$title" "$f" --vault "$VAULT" >/dev/null; fi
    updated=$((updated+1))
  else
    if [ "$DRY_RUN" -eq 1 ]; then log "would CREATE $title"; else op document create "$f" --title "$title" --vault "$VAULT" --tags "$project" >/dev/null; fi
    created=$((created+1))
  fi
done < <(discover_env_files)

printf 'created=%d updated=%d\n' "$created" "$updated"
```

- [ ] **Step 5: Make it executable and run the test to verify it passes**

Run: `cd scripts/local-backup && chmod +x backup-secrets.sh tests/stubs/op && bash tests/test_secrets_backup.sh`
Expected: `ran=5 failed=0`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/local-backup/backup-secrets.sh scripts/local-backup/tests/stubs/op scripts/local-backup/tests/test_secrets_backup.sh
git commit -m "feat(backup): idempotent .env -> 1Password backup with dry-run"
```

---

## Task 5: Secrets restore (non-destructive)

**Files:**
- Create: `scripts/local-backup/restore-secrets.sh`
- Test: `scripts/local-backup/tests/test_secrets_restore.sh`

**Interfaces:**
- Consumes: `cfg_str`, `title_to_env_path`, stub/real `op item list --format=json`, `op document get`.
- Produces: executable `restore-secrets.sh` supporting `--dry-run`, `--force`, `--filter <project>`. Behavior:
  1. Preflight `op whoami`.
  2. `op item list --vault "$VAULT" --format=json` → titles via `jq -r '.[].title'`.
  3. For each title (optionally filtered to those starting `<project>/`): target = `title_to_env_path "<title>"`. If target exists and not `--force` → skip with a warning. Else `mkdir -p` parent and `op document get "<title>" --vault "$VAULT" > target` (dry-run: just log).
  4. Print `restored=N skipped=M`.

- [ ] **Step 1: Write the failing test** — `scripts/local-backup/tests/test_secrets_restore.sh`

```bash
#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export OP_STUB_DIR="$TMP/opstate"
export PATH="$DIR/stubs:$PATH"
export HOME="$TMP/home"; mkdir -p "$HOME"

# Seed vault state directly (simulate a prior backup).
mkdir -p "$OP_STUB_DIR/Local-Env-Backups"
printf 'A=1\n' > "$OP_STUB_DIR/Local-Env-Backups/RestoreAssist%2F.env"
printf 'B=2\n' > "$OP_STUB_DIR/Local-Env-Backups/Synthex%2F.env.local"

# Restore everything onto a clean HOME.
OUT1="$(bash "$DIR/../restore-secrets.sh")"
assert_contains "$OUT1" "restored=2" "restores both"
assert_file "$HOME/RestoreAssist/.env" "RestoreAssist/.env written"
assert_eq "$(cat "$HOME/Synthex/.env.local")" "B=2" "content correct"

# Non-destructive: existing file is skipped without --force.
printf 'LOCAL=keep\n' > "$HOME/RestoreAssist/.env"
OUT2="$(bash "$DIR/../restore-secrets.sh")"
assert_contains "$OUT2" "skipped=2" "skips existing without force"
assert_eq "$(cat "$HOME/RestoreAssist/.env")" "LOCAL=keep" "existing file untouched"

# --force overwrites.
OUT3="$(bash "$DIR/../restore-secrets.sh" --force)"
assert_eq "$(cat "$HOME/RestoreAssist/.env")" "A=1" "force overwrites"

# --filter limits to one project.
rm -rf "$HOME/RestoreAssist" "$HOME/Synthex"
OUT4="$(bash "$DIR/../restore-secrets.sh" --filter Synthex)"
assert_contains "$OUT4" "restored=1" "filter restores one"
assert_nofile "$HOME/RestoreAssist/.env" "filtered-out project not restored"

assert_finish
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts/local-backup && bash tests/test_secrets_restore.sh`
Expected: FAIL — `restore-secrets.sh` not found.

- [ ] **Step 3: Implement** — `scripts/local-backup/restore-secrets.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
LB_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$LB_DIR/lib/common.sh"
. "$LB_DIR/lib/secrets.sh"

DRY_RUN=0; FORCE=0; FILTER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --filter) FILTER="${2:-}"; shift ;;
    *) die "unknown arg: $1" ;;
  esac
  shift
done

VAULT="$(cfg_str '.secrets.vault')"
op whoami >/dev/null 2>&1 || die "Not signed in to 1Password. Run: eval \$(op signin)"
[ "$DRY_RUN" -eq 1 ] && log "DRY-RUN: no files will be written."

restored=0; skipped=0
while IFS= read -r title; do
  [ -n "$title" ] || continue
  if [ -n "$FILTER" ]; then case "$title" in "$FILTER"/*) ;; *) continue ;; esac; fi
  target="$(title_to_env_path "$title")"
  if [ -e "$target" ] && [ "$FORCE" -eq 0 ]; then
    log "skip (exists): $title  (use --force to overwrite)"; skipped=$((skipped+1)); continue
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    log "would restore $title -> $target"
  else
    mkdir -p "$(dirname "$target")"
    op document get "$title" --vault "$VAULT" > "$target"
  fi
  restored=$((restored+1))
done < <(op item list --vault "$VAULT" --format=json | jq -r '.[].title')

printf 'restored=%d skipped=%d\n' "$restored" "$skipped"
```

- [ ] **Step 4: Make executable and run the test to verify it passes**

Run: `cd scripts/local-backup && chmod +x restore-secrets.sh && bash tests/test_secrets_restore.sh`
Expected: `ran=8 failed=0`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/local-backup/restore-secrets.sh scripts/local-backup/tests/test_secrets_restore.sh
git commit -m "feat(backup): non-destructive .env restore with --force/--filter"
```

---

## Task 6: Media backup & restore (Google Drive via rclone)

**Files:**
- Create: `scripts/local-backup/lib/media.sh`
- Create: `scripts/local-backup/backup-media.sh`
- Create: `scripts/local-backup/restore-media.sh`
- Create: `scripts/local-backup/tests/stubs/rclone`
- Test: `scripts/local-backup/tests/test_media.sh`

**Interfaces:**
- Consumes: `cfg_str`, `cfg_list`, `lb_hostname`, `log`, `die`.
- Produces:
  - `media.sh`: `media_dest(localRel)` → echoes `<remote>:<destPrefix>/<hostname>/<localRel>` using config + `lb_hostname`.
  - `backup-media.sh` (`--dry-run`): preflight that remote exists via `rclone listremotes` (must contain `<remote>:`), then for each `.media.folders[]` entry run `rclone copy "$HOME/<rel>" "<dest>"` (append `--dry-run` to rclone when `--dry-run`).
  - `restore-media.sh` (`--dry-run`): reverse direction `rclone copy "<dest>" "$HOME/<rel>"`. `rclone copy` is additive (never deletes), so it is non-destructive by construction.
- Stub `rclone` contract: `listremotes` prints `gdrive:`; `copy` appends its full argv to `$RCLONE_LOG` and exits 0.

- [ ] **Step 1: Write the stub rclone** — `scripts/local-backup/tests/stubs/rclone`

```bash
#!/usr/bin/env bash
set -uo pipefail
case "${1:-}" in
  listremotes) printf '%s\n' "${RCLONE_REMOTES:-gdrive:}" ;;
  copy) printf 'copy %s\n' "$*" >> "${RCLONE_LOG:?RCLONE_LOG must be set}" ;;
  *) echo "stub rclone: unhandled '${1:-}'" >&2; exit 2 ;;
esac
```

- [ ] **Step 2: Write the failing test** — `scripts/local-backup/tests/test_media.sh`

```bash
#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/assert.sh"
. "$DIR/../lib/common.sh"
. "$DIR/../lib/media.sh"

export LB_HOSTNAME="testbox"
assert_eq "$(media_dest 'RestoreAssist/public/videos/remotion')" \
  "gdrive:Backups/testbox/RestoreAssist/public/videos/remotion" "dest mapping"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export PATH="$DIR/stubs:$PATH"
export HOME="$TMP/home"; mkdir -p "$HOME/RestoreAssist/public/videos/remotion"
export RCLONE_LOG="$TMP/rclone.log"; : > "$RCLONE_LOG"

bash "$DIR/../backup-media.sh" >/dev/null
LOG="$(cat "$RCLONE_LOG")"
assert_contains "$LOG" "copy $HOME/RestoreAssist/public/videos/remotion gdrive:Backups/testbox/RestoreAssist/public/videos/remotion" "backup copies local->remote"

: > "$RCLONE_LOG"
bash "$DIR/../restore-media.sh" >/dev/null
LOG2="$(cat "$RCLONE_LOG")"
assert_contains "$LOG2" "copy gdrive:Backups/testbox/RestoreAssist/public/videos/remotion $HOME/RestoreAssist/public/videos/remotion" "restore copies remote->local"

: > "$RCLONE_LOG"
bash "$DIR/../backup-media.sh" --dry-run >/dev/null
assert_contains "$(cat "$RCLONE_LOG")" "--dry-run" "dry-run passes flag to rclone"

# Preflight fails clearly when remote missing.
RCLONE_REMOTES="other:" bash "$DIR/../backup-media.sh" 2>"$TMP/err" && echo "FAIL: should have errored" 
assert_contains "$(cat "$TMP/err")" "remote" "missing remote errors"

assert_finish
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd scripts/local-backup && bash tests/test_media.sh`
Expected: FAIL — `media.sh` not found / `media_dest: command not found`.

- [ ] **Step 4: Implement `media.sh`** — `scripts/local-backup/lib/media.sh`

```bash
# Sourced after common.sh.
media_dest() {
  local rel="$1" remote prefix host
  remote="$(cfg_str '.media.remote')"
  prefix="$(cfg_str '.media.destPrefix')"
  host="$(lb_hostname)"
  printf '%s:%s/%s/%s\n' "$remote" "$prefix" "$host" "$rel"
}

media_preflight() {
  local remote; remote="$(cfg_str '.media.remote')"
  rclone listremotes 2>/dev/null | grep -q "^${remote}:$" || die "rclone remote '${remote}:' not found. Run: rclone config"
}
```

- [ ] **Step 5: Implement `backup-media.sh`** — `scripts/local-backup/backup-media.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
LB_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$LB_DIR/lib/common.sh"
. "$LB_DIR/lib/media.sh"

DRY=()
for a in "$@"; do case "$a" in --dry-run) DRY=(--dry-run) ;; *) die "unknown arg: $a" ;; esac; done

media_preflight
n=0
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  src="$HOME/$rel"
  [ -d "$src" ] || { log "skip (no local dir): $rel"; continue; }
  log "backup: $rel -> $(media_dest "$rel")"
  rclone copy "$src" "$(media_dest "$rel")" "${DRY[@]+"${DRY[@]}"}"
  n=$((n+1))
done < <(cfg_list '.media.folders[]')
printf 'media_backed_up=%d\n' "$n"
```

- [ ] **Step 6: Implement `restore-media.sh`** — `scripts/local-backup/restore-media.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
LB_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$LB_DIR/lib/common.sh"
. "$LB_DIR/lib/media.sh"

DRY=()
for a in "$@"; do case "$a" in --dry-run) DRY=(--dry-run) ;; *) die "unknown arg: $a" ;; esac; done

media_preflight
n=0
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  dest="$HOME/$rel"
  log "restore: $(media_dest "$rel") -> $rel"
  mkdir -p "$dest"
  rclone copy "$(media_dest "$rel")" "$dest" "${DRY[@]+"${DRY[@]}"}"
  n=$((n+1))
done < <(cfg_list '.media.folders[]')
printf 'media_restored=%d\n' "$n"
```

- [ ] **Step 7: Make executable and run the test to verify it passes**

Run: `cd scripts/local-backup && chmod +x backup-media.sh restore-media.sh tests/stubs/rclone && bash tests/test_media.sh`
Expected: `ran=5 failed=0`, exit 0 (the inline "should have errored" guard prints nothing because preflight `die`s with nonzero, short-circuiting `&&`).

- [ ] **Step 8: Commit**

```bash
git add scripts/local-backup/lib/media.sh scripts/local-backup/backup-media.sh scripts/local-backup/restore-media.sh scripts/local-backup/tests/stubs/rclone scripts/local-backup/tests/test_media.sh
git commit -m "feat(backup): media backup/restore to Google Drive via rclone"
```

---

## Task 7: README runbook + full-suite integration check

**Files:**
- Create: `scripts/local-backup/README.md`
- Test: `scripts/local-backup/tests/run-tests.sh` (already exists — this task runs the whole suite)

**Interfaces:**
- Consumes: every script. Produces: documentation + a green full-suite run.

- [ ] **Step 1: Write the README** — `scripts/local-backup/README.md`

````markdown
# Local-Data Backup & Recovery

Backs up this Mac's irreplaceable local data:
- **Secrets** (`.env*` files) → a dedicated 1Password vault `Local-Env-Backups`.
- **Bulky/expensive media** → Google Drive (`gdrive:Backups/<hostname>/...`) via `rclone`.

Regenerable build caches (`node_modules`, `.next`) and git-tracked files are **not** backed up — they regenerate or already live on GitHub.

## One-time setup

1. **1Password CLI** (already installed): sign in so `op` works:
   ```bash
   eval "$(op signin)"
   op whoami
   ```
2. **rclone** (no Homebrew needed):
   ```bash
   curl https://rclone.org/install.sh | sudo bash
   rclone config         # create a Google Drive remote named exactly: gdrive
   rclone listremotes    # should show: gdrive:
   ```
3. Review `backup.config.json` — adjust `media.folders` to taste.

## Usage

```bash
cd scripts/local-backup

# Preview everything first
./backup-secrets.sh --dry-run
./backup-media.sh   --dry-run

# Back up for real
./backup-secrets.sh         # .env files -> 1Password
./backup-media.sh           # media -> Google Drive
```

## Disaster recovery (clean machine)

```bash
eval "$(op signin)"                 # 1Password
curl https://rclone.org/install.sh | sudo bash && rclone config   # gdrive remote

cd scripts/local-backup
./restore-secrets.sh --dry-run      # preview
./restore-secrets.sh                # writes .env files back (skips existing)
./restore-secrets.sh --force        # overwrite existing
./restore-secrets.sh --filter RestoreAssist   # one project only
./restore-media.sh                  # pull media back from Drive
```

## Tests

```bash
bash tests/run-tests.sh             # pure-bash, offline (stubs for op/rclone)
```

## Notes
- Restore is **non-destructive** without `--force`.
- Media uses `rclone copy` (additive) — backup never deletes remote files.
- Scripts contain no secrets and are safe to commit.
````

- [ ] **Step 2: Run the full test suite**

Run: `cd scripts/local-backup && bash tests/run-tests.sh`
Expected: each `test_*.sh` prints `ran=N failed=0`; final line `==== 0 test file(s) failed ====`; exit 0.

- [ ] **Step 3: Manual smoke (real tools, dry-run only)**

Run: `cd scripts/local-backup && ./backup-secrets.sh --dry-run`
Expected: with `op` signed in, prints `would CREATE …`/`would UPDATE …` lines for your real `.env` files and a final `created=… updated=…` summary. (If `op` is not signed in, it should `die` with the sign-in hint — that is also a valid pass for the preflight.)

- [ ] **Step 4: Commit**

```bash
git add scripts/local-backup/README.md
git commit -m "docs(backup): add setup, usage, and disaster-recovery runbook"
```

---

## Self-Review

**Spec coverage:**
- Secrets → 1Password (vault, one-doc-per-file, idempotent, encrypted-by-1Password, recovery) → Tasks 2–5. ✓
- Media → Drive via rclone (opt-in folders, plain, additive `copy`, recovery) → Task 6. ✓
- Config file `backup.config.json` with the spec's exact keys → Task 1. ✓
- `--dry-run` everywhere; non-destructive restore without `--force` → Tasks 4–6. ✓
- Pre-flight checks (`op whoami`, remote exists) → Tasks 4–6. ✓
- README runbook → Task 7. ✓
- Manual run mode; LaunchAgent explicitly deferred (out of scope) → matches spec. ✓
- Tool location `scripts/local-backup/` → all tasks. ✓

**Placeholder scan:** No TBD/TODO; every code/test step contains complete, runnable content. ✓

**Type/name consistency:** `discover_env_files`, `env_path_to_title`, `title_to_env_path`, `media_dest`, `media_preflight`, `cfg_str`, `cfg_list`, `lb_hostname`, vault `Local-Env-Backups`, remote `gdrive`, dest `gdrive:Backups/<hostname>/` are used identically across all tasks and the stubs. ✓

**Known environment assumptions baked in:** bash 3.2 (no associative arrays), BSD `find`, `jq` present, `op` present, `rclone` installed at setup time, stubs make the suite offline. ✓
