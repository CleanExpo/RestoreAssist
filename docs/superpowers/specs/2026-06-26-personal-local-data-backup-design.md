# Personal Local-Data Backup & Recovery — Design (v1)

**Date:** 2026-06-26
**Status:** Approved — ready for implementation plan
**Author:** Phill McGurk (with Claude Code)
**Scope:** Personal machine backup tool. The RestoreAssist *product* Drive feature is a separate, later spec.

---

## Background & motivation

This Mac hit a transient "no disk space" condition. Investigation showed:

- **~110 GB of usage was regenerable build artifacts** (`node_modules`, `.next`, `.turbo`) — not data. This was cleared during triage, reclaiming **120 GB** (data volume went 325 GB → 205 GB used; `.hermes` deliberately excluded to avoid breaking the running fleet). Build caches regenerate via `npm install` / `next build`.
- **Source code is already safe on GitHub** — does not need a separate backup.
- The only genuinely **irreplaceable local data** is:
  - **49 real `.env*` secret files** across 13 project folders (small, sensitive, recovered individually).
  - A small amount of **expensive-to-regenerate media** (Remotion render outputs). Most other media is either git-tracked (already on GitHub) or disposable.

The insight driving this design: **secrets and bulk media have opposite needs**, so each is routed to its correct home rather than dumping everything into Google Drive.

## Goal

A simple, repeatable, idempotent tool to **back up and recover** the irreplaceable data on this machine:

- **Secrets → 1Password** (encrypted, Touch-ID unlock, synced, versioned).
- **Bulky / expensive media → Google Drive** (via `rclone`, plain, browsable).

Non-goals: backing up regenerable caches, source already in git, or cloud-hosted data (Supabase/Postgres lives in the cloud already).

## Success criteria

1. Running `backup-secrets.sh` captures all 49 `.env` files into a dedicated 1Password vault, idempotently (re-runs update, never duplicate).
2. Running `restore-secrets.sh` reconstructs every `.env` file at its original path on a clean machine.
3. `backup-media.sh` / `restore-media.sh` round-trip the configured media folders to/from Google Drive.
4. All scripts support `--dry-run` and never destroy local data without `--force`.
5. A `README.md` runbook documents setup and full disaster recovery.

---

## Architecture (Approach A — split by data type)

Two independent, composable script pairs driven by one config file. No daemon required for v1.

```
scripts/local-backup/                (in RestoreAssist repo; scripts contain NO secrets)
├── backup.config.json               what to back up (env discovery rules + media folder list)
├── backup-secrets.sh                gather .env files → 1Password vault
├── restore-secrets.sh               1Password vault → write .env files back to paths
├── backup-media.sh                  rclone curated media folders → Google Drive
├── restore-media.sh                 rclone Google Drive → pull media back
└── README.md                        setup + usage + disaster-recovery runbook
```

**Rationale for location:** the tool lives in the RestoreAssist repo because that is the active workspace and the scripts are generic and secret-free. It is portable — nothing ties it to RestoreAssist beyond convenience. (Open option: relocate to a standalone `~/backup-tools` repo later if desired.)

### Configuration — `backup.config.json`

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

---

## Component 1 — Secrets → 1Password (the core)

- **Discovery:** find real `.env*` files under each `secrets.roots` entry, applying `includeGlobs` / `excludeGlobs` / `excludePaths`. Baseline today: **49 files across 13 folders** (incl. `.hermes`, `ITR Dimitri`, `Unite-Nexus`, `Unite-Group`, `Synthex`, `RestoreAssist`, …).
- **Store:** dedicated 1Password vault **`Local-Env-Backups`**. **One document item per file**, item **title = path relative to `$HOME`** (e.g. `RestoreAssist/.env.local`), **tagged by top-level project folder**.
- **Idempotency:** before creating, look up the item by title in the vault. If it exists, **edit/replace** its document content; otherwise **create**. Never produce duplicates.
- **Encryption:** delegated entirely to 1Password (encrypted at rest, Touch-ID unlock, synced across devices, version history). No bespoke crypto.
- **Recovery (`restore-secrets.sh`):** for each document in the vault, write its content back to `$HOME/<title>`. Supports `--filter <project>` to restore a single project and `--dry-run` to preview. Refuses to overwrite an existing local file unless `--force`.

**Implementation notes:**
- Requires the user to be signed in to `op` (Touch ID). Script checks `op whoami` first and aborts with a clear message if not.
- The vault `Local-Env-Backups` is created once (manually or by a guarded `op vault create` on first run).
- `.env` file contents are stored via 1Password **document** items (`op document create` / `op document edit`), which preserve exact bytes including newlines.

## Component 2 — Media → Google Drive (optional, opt-in per folder)

- **Tool:** `rclone` (install via Homebrew). One-time `rclone config` creates a Google Drive remote named **`gdrive`** via browser OAuth against the user's personal Google account.
- **What:** only the folders listed in `media.folders`. v1 seed: `RestoreAssist/public/videos/remotion` (expensive Remotion renders). Git-tracked media and `node_modules` are excluded by design — they are already on GitHub or disposable.
- **Destination:** `gdrive:Backups/<hostname>/<relative-path>`. **Plain** (non-sensitive → browsable in the Drive UI).
- **Safety:** uses `rclone copy` (**additive**, never deletes on the remote); incremental and resumable.
- **Recovery (`restore-media.sh`):** `rclone copy` from `gdrive:Backups/<hostname>/...` back to the local path. `--dry-run` supported; refuses to overwrite without `--force`.

---

## Run mode

- **v1: manual** — `./backup-secrets.sh && ./backup-media.sh` on demand.
- **Optional later (not built in v1):** a documented `launchd` LaunchAgent for a weekly automated run.

## Error handling & safety

- `--dry-run` on every script: prints the plan, changes nothing.
- **Pre-flight checks:** secrets scripts verify `op whoami` succeeds; media scripts verify the `gdrive` remote exists (`rclone listremotes`).
- **Non-destructive restore:** restore never overwrites an existing local file without `--force`.
- **Additive media backup:** `rclone copy` (not `sync`) so a remote file is never deleted by a backup run.
- Each run prints a summary (added / updated / skipped) and **exits non-zero on any failure**.

## Out of scope (v1)

- Fleet / `.hermes` backups (the 2GB+ pre-update zips and `nexus-cfo-state.db.bak` — separate concern).
- Cloud Postgres / Supabase data (already cloud-hosted).
- The RestoreAssist **product** per-org Google Drive storage/recovery feature — **this is the second spec** to be designed after v1 ships.
- Scheduled/automated runs (deferred; manual for v1).

## Open questions / future work

- Whether to relocate the tool to a standalone `~/backup-tools` repo (currently in RestoreAssist for convenience).
- Whether to add the Nexus CFO DB and other fleet state to a future, broader backup scope.
- Scheduling via LaunchAgent once the manual flow is proven.
