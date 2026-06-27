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
