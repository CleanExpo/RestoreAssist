# Branch Protection Configuration

This guide configures GitHub branch protection rules for RestoreAssist.

## Main Branch Protection

**Path**: Settings > Branches > Branch protection rules > main

### Basic Settings

- **Require a pull request before merging**: ✓
  - Required approving reviews: `1`
  - Dismiss stale pull request approvals when new commits are pushed: ✓
  - Require review from Code Owners: ✓

- **Require status checks to pass before merging**: ✓
  - Require branches to be up to date before merging: ✓

### Required Status Checks

Mark these as required (in order of importance):

```
Status Check Name                           | Required
─────────────────────────────────────────────────────
CI / quality                                | ✓
CI / frontend-tests                         | ✓
CI / backend-tests                          | ✓
CI / e2e-tests                              | ✓
CI / build                                  | ✓
```

### Code Quality Requirements

- **Require code reviews**: ✓
  - Number of approvals: `1`
  - Require review of most recent commit: ✓
  - Require review by Code Owners: ✓

- **Allow auto-merge**: ✓
  - Only allow auto-merge if all checks pass: ✓

### Restrictions

- **Require deployment to succeed before merging**: ✓
  - Required deployments: `vercel`

- **Require branches to be up to date before merging**: ✓

- **Require linear history**: ✓
  - Prevents merge commits

- **Include administrators**: ✓
  - Enforce restrictions for administrators

- **Restrict who can push to matching branches**:
  - Allow admins: ✓
  - Allow maintainers: ✓
  - Restrict to specified actors

## Develop Branch Protection

**Path**: Settings > Branches > Branch protection rules > develop

### Settings

- **Require a pull request before merging**: ✓
  - Required approving reviews: `0` (less strict than main)
  - Dismiss stale approvals: ✓

- **Require status checks to pass before merging**: ✓
  - Required: `CI / quality`, `CI / frontend-tests`, `CI / backend-tests`

- **Require linear history**: ✗ (allow merge commits)

- **Allow auto-merge**: ✓

## Automation Rules

### Auto-Merge Configuration

**File**: `.github/workflows/auto-merge.yml`

Automatically merge PRs when:
- All status checks pass
- Approved by code owner
- No conflicts
- PR created by trusted bot (Dependabot, etc.)

### Automatic PR Creation

**File**: `.github/workflows/dependabot.yml`

Dependabot automatically creates PRs for:
- npm dependency updates (weekly)
- Python dependency updates (weekly)
- GitHub Actions updates (daily)

**Auto-merge rules for Dependabot**:
- Minor version updates: auto-merge ✓
- Patch updates: auto-merge ✓
- Major updates: requires manual review

## Code Owners

**File**: `.github/CODEOWNERS`

Define required reviewers for specific files:

```
# Backend
/apps/backend/                @backend-team
/apps/backend/src/db/         @database-team
/apps/backend/src/models/     @ai-team

# Frontend
/apps/web/                    @frontend-team
/apps/web/tests/e2e/          @qa-team
/apps/web/components/         @frontend-team

# Configuration
/vercel.json                  @devops-team
/app.yaml                     @devops-team
/.github/workflows/           @devops-team

# Documentation
/docs/                        @documentation-team
/README.md                    @documentation-team
```

## Setup Instructions

### Via GitHub UI

1. Go to Settings > Branches
2. Click "Add rule"
3. Enter branch name pattern: `main`
4. Configure all settings above
5. Click "Create"

### Via GitHub CLI

```bash
# List current branch protection
gh api repos/{owner}/{repo}/branches/main/protection

# Create/update protection
gh api repos/{owner}/{repo}/branches/main/protection \
  -f required_status_checks='{"strict":true,"contexts":["CI / quality","CI / frontend-tests","CI / backend-tests"]}' \
  -f required_pull_request_reviews='{"dismissal_restrictions":{},"dismiss_stale_reviews":true,"require_code_owner_reviews":true,"required_approving_review_count":1}' \
  -f enforce_admins=true \
  -f required_linear_history=true
```

## Testing Branch Protection

### Verify Rules Are Enforced

1. Create test PR
2. Attempt merge without checks passing → Should fail ✓
3. Attempt merge without approval → Should fail ✓
4. Get approval but revert to main → Approve merge → Should succeed ✓

## Exceptions

### Bypass Restrictions

Only for emergency hot fixes:

1. Get approval from 2 admins
2. Use admin bypass (if enabled)
3. Document reason in PR
4. Post-mortem review within 24 hours

### Temporary Disable

```bash
# Only if absolutely necessary
gh api repos/{owner}/{repo}/branches/main/protection \
  -f enforce_admins=false
```

## Monitoring

### Check Protection Status

```bash
# See all branch protection rules
gh api repos/{owner}/{repo}/branches --jq '.[] | {name, protected}'

# Get detailed protection info
gh api repos/{owner}/{repo}/branches/main/protection
```

### Metrics

Monitor in GitHub:
- Settings > Branches > Branch protection rules
- Insights > Network (see PR flow)
- Insights > Pulse (see activity)

## Common Issues

### "Required status checks are not passing"

**Cause**: CI workflow hasn't completed

**Solution**:
1. Wait for CI to finish
2. Check workflow logs if failing
3. Fix errors and push new commit

### "This branch can't be merged"

**Cause**: Likely needs approval or rebase

**Solution**:
1. Check "Checks" tab for failing tests
2. Request review if needed
3. Update branch if stale: `Update branch` button

### "Dismiss stale reviews" not working

**Cause**: Feature might not be enabled

**Solution**:
1. Go to Settings > Branches
2. Enable "Dismiss stale pull request approvals"
3. Save changes

## Best Practices

✅ **DO**:
- Keep branch protection simple and clear
- Document all requirements
- Review logs regularly
- Use status checks for quality gates
- Require minimal approvals for faster delivery

❌ **DON'T**:
- Over-complicate requirements
- Disable checks for convenience
- Bypass reviews for speed
- Require excessive approvals
- Create unnecessary protection rules

## Troubleshooting Workflow

1. **Check Settings**: Verify all checks listed
2. **Check Workflows**: Ensure workflows create/update checks
3. **Check Secrets**: Verify required secrets are set
4. **Check Logs**: Review GitHub Actions logs for errors
5. **Contact Support**: Reach out if still stuck

---

**Configuration Version**: 1.0
**Last Updated**: 2026-01-07
**Reviewed By**: DevOps Team
