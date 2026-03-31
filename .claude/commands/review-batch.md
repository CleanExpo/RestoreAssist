---
description: "Batch review all open PRs — triages, prioritises, reviews in waves, produces summary report"
---

# Batch PR Review

Review all open pull requests in priority order, producing a consolidated report.

## Usage

```
/review-batch                    # Review all open PRs
/review-batch --limit 10         # Review first 10 PRs by priority
/review-batch --risk critical    # Only review critical-risk PRs
/review-batch --post             # Post reviews to GitHub as you go
/review-batch --stale 30         # Flag PRs older than 30 days
```

## Input

`$ARGUMENTS` = flags (all optional). Defaults to reviewing all open PRs without posting.

## Pipeline

### Stage 1: Fetch All Open PRs

```bash
gh pr list --repo CleanExpo/RestoreAssist --state open --json number,title,headRefName,createdAt,additions,deletions,changedFiles --limit 200
```

### Stage 2: Triage All PRs

For each PR, run a lightweight triage (no diff fetch yet — just file list):

```bash
gh pr view {number} --repo CleanExpo/RestoreAssist --json files,additions,deletions
```

Classify each PR by risk level using the PR Manager's risk matrix.

### Stage 3: Priority Ordering

Sort PRs for review in this order:
1. **Critical risk** (Prisma/auth/payment) — review immediately, these block the repo
2. **Complex risk** (API routes, business logic) — review next
3. **Standard risk** (UI pages, components) — batch review
4. **Trivial risk** (docs, typos) — auto-approve with label
5. **Stale** (created > 30 days ago, no recent commits) — flag for closure decision

If `--limit N` is set, take the first N after sorting.
If `--risk X` is set, filter to only that risk level.

### Stage 4: Wave-Based Review

Process PRs in waves of 3 (to avoid overwhelming context):

**For each wave:**
1. Run `/review-pr {number}` for each PR in the wave (can dispatch 3 parallel agents)
2. Collect verdicts
3. If `--post` flag: post reviews to GitHub
4. Add to summary table
5. Proceed to next wave

**For Trivial PRs:**
- Skip full review
- Apply label `risk:trivial` and `reviewed:approved`
- Add to summary as "Auto-approved (trivial)"

### Stage 5: Stale PR Detection

For PRs older than `--stale` days (default 30):
- Flag as "⏰ Stale — consider closing or rebasing"
- Do NOT auto-close — that requires Phill's decision
- Add to a separate "Stale PRs" section in the report

### Stage 6: Summary Report

Output a consolidated report:

```markdown
## 📋 Batch Review Summary — [DATE]

**Total Open PRs:** XXX
**Reviewed:** XX | **Auto-Approved:** XX | **Skipped (stale):** XX

### Results

| PR | Title | Risk | Verdict | Critical | Important | Suggestions |
|----|-------|------|---------|----------|-----------|-------------|
| #124 | Brand messaging | Standard | ✅ Approved | 0 | 1 | 2 |
| #125 | Remotion videos | Complex | ⚠️ Changes | 1 | 3 | 1 |
| #123 | Invoice payments | Standard | ✅ Approved | 0 | 0 | 1 |
| ... | ... | ... | ... | ... | ... | ... |

### Summary by Verdict
- ✅ **Approved:** XX PRs — ready to merge
- ⚠️ **Changes Requested:** XX PRs — need fixes before merge
- 💬 **Needs Discussion:** XX PRs — require Phill's input
- 🤖 **Auto-Approved:** XX PRs — trivial changes, safe to merge
- ⏰ **Stale:** XX PRs — consider closing

### Critical Findings Across All PRs
<!-- Deduplicated list of all Critical-severity findings -->
1. PR #XXX: [Security] Missing auth check in `app/api/foo/route.ts`
2. PR #XXX: [Migration] Destructive column drop in `prisma/migrations/...`

### Recommended Merge Order
<!-- PRs that are approved, ordered by dependency and risk -->
1. Merge trivial/auto-approved PRs first (low risk, quick wins)
2. Merge standard-approved PRs next
3. Address changes-requested PRs
4. Discuss needs-discussion PRs with Phill

### PRs Recommended for Closure
<!-- Stale PRs or PRs superseded by newer work -->
- PR #XX: [title] — last updated [date], superseded by PR #YY
```

## Performance Notes

- Batch review of 100+ PRs will take 30–60 minutes
- Use `--limit 10` for quick triage sessions
- The triage stage (Stage 2) is fast — classification without diff reading
- The review stage (Stage 4) is the bottleneck — each PR takes 1–3 minutes
- Running with `--post` adds ~5 seconds per PR for GitHub API calls

## Integration with Linear

After batch review, optionally update Linear issues:
- Approved PRs → move linked RA-XXX issue to "In Review" (if not already)
- Changes Requested PRs → keep RA-XXX in "In Progress"
- Stale PRs → flag RA-XXX for backlog grooming
