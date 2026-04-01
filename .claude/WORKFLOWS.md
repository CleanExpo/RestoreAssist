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
chore: update pnpm lockfile
```

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`
Scope: Linear issue ID (`RA-XXX`) or area (`ci`, `auth`, `prisma`)

## PR Process

1. Create branch from `main`
2. Implement + commit (small, focused commits)
3. Push branch: `git push origin feat/ra-xxx-description`
4. Create PR: `gh pr create --base main`
5. CI runs automatically:
   - **Quality Checks** (PR Quality Gates workflow): pnpm install + type-check
   - **Vercel Preview**: builds and deploys preview URL
   - **CodeRabbit**: automated code review
6. Squash merge to main: `gh pr merge --squash --delete-branch`
7. Update Linear issue to Done

### PR Checklist

- [ ] `pnpm type-check` passes
- [ ] No new `any` types without justification
- [ ] API routes have auth checks
- [ ] Prisma queries have `take` limits
- [ ] No secrets in code
- [ ] Linear issue linked in PR body (`Closes RA-XXX`)

## Deployment

### Production (DigitalOcean)

- Auto-deploys from `main` branch
- Config: `.do/app.yaml`
- Region: Sydney (`syd`)
- Build: `npm run build` (runs prisma generate + migrate deploy + next build)
- Env vars set in DO App Platform dashboard

### Preview (Vercel)

- Auto-deploys on every PR
- Project: `unite-group/restoreassist`
- Used for visual review only — production runs on DO

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
# DO auto-deploys the revert
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
