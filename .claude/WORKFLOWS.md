# Workflows — RestoreAssist

## Branch Naming

```
feat/ra-{issue-number}-{short-description}    # Features
fix/ra-{issue-number}-{short-description}      # Bug fixes
chore/{description}                            # Maintenance
```

Examples: `feat/ra-384-mobile-scaffold`, `fix/ra-318-moisture-crud`

## Commit Messages

Format: `type(scope): description`

```
feat(RA-384): scaffold mobile app source structure
fix(ci): upgrade Java 17 → 21 for Capacitor 8 compatibility
chore: update npm lockfile
```

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`
Scope: Linear issue ID (`RA-XXX`) or area (`ci`, `auth`, `prisma`)

## PR Process

1. Create branch from `main`
2. Implement + commit (small, focused commits)
3. Push branch: `git push origin feat/ra-xxx-description`
4. Create PR: `gh pr create --base main`
5. CI runs automatically:
   - **Quality Checks** (PR Quality Gates workflow): npm ci + type-check
   - **Vercel Preview**: builds and deploys preview URL
   - **CodeRabbit**: automated code review
6. Squash merge to main: `gh pr merge --squash --delete-branch`
7. Update Linear issue to Done

### PR Checklist

- [ ] `npm run type-check` passes
- [ ] No new `any` types without justification
- [ ] API routes have auth checks
- [ ] Prisma queries have `take` limits
- [ ] No secrets in code
- [ ] Linear issue linked in PR body (`Closes RA-XXX`)

## Deployment

### Production (DigitalOcean App Platform)

**Merging to `main` ships nothing.** Until 31/08/2026 this section asserted the
opposite -- that pushing to the default branch was enough to reach production.
That was the single most consequential wrong sentence in the file, and it is
auto-loaded context, so every agent inherited the belief.

- Promotion is `deploy-production.yml`, **`workflow_dispatch`-only**. It requires
  a successful release-gate run ID for the SHA, and the full 40-character SHA
  typed as confirmation. See `.claude/RULES.md` rule 33: merging into `main` and
  promoting a release are owner actions; an agent opens a PR and stops.
- The image is built separately by `build-production-image.yml` on push to
  `main` and published to GHCR digest-pinned.
  **Building an image is not deploying it.** Those runs go green on every push,
  which is exactly why they get mistaken for a deploy. `.do/app.yaml` is a
  digest-pinned image spec that `render-production-app-spec.mjs` fills in at
  deploy time.
- App: `restoreassist.app`
- Env vars set in the DigitalOcean App Platform component
- Deployment parity is verified against the active DigitalOcean component SHA

Historical note worth keeping: the live DO app was originally created from a
spec carrying `deploy_on_push: true` (commit `947d965e`, 03/12/2025) together
with a `DEPLOYMENT_FAILED` alert rule. That spec has never been replaced on the
provider, so the live app may still autodeploy on push and email on failure --
which is not the same as this repository having a working deploy path. Changing
it is a DigitalOcean console action; nothing committed here reaches the
provider.

### Preview (Vercel)

- Auto-deploys on every PR
- Project: `unite-group/restoreassist` (same as production, separate Preview environment)
- Each PR gets a unique `restoreassist-git-<branch>-<hash>-unite-group.vercel.app` URL
- Preview environment uses Preview-scoped env vars (separate from Production)

### Android Builds (GitHub Actions)

- Trigger: push tag `android-v*` (e.g., `android-v1.0.0`)
- Workflow: `.github/workflows/android-build-field-app.yml`
- Output: signed AAB artifact (30-day retention)
- Secrets required: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`

## Rollback

### Web App

```bash
# Find the last good commit
git log --oneline -10

# Revert on main
git revert HEAD
git push origin main
# DigitalOcean App Platform auto-deploys the revert
```

### Database

```bash
# Check migration history
npx prisma migrate status

# If latest migration is problematic, create a counter-migration
# Never use `migrate reset` in production
```

## Linear Integration

- Workspace: unite-hub
- Team: RestoreAssist (RA-xxx issues)
- State flow: Backlog → Todo → In Progress → In Review → Done
- Issues auto-link to PRs via `Closes RA-XXX` in PR body
