---
description: "Review a single PR through the full review pipeline — triage → automated checks → dimensional review → verdict"
---

# Review PR Pipeline

Review a single pull request through the complete quality pipeline.

## Usage

```
/review-pr 124
/review-pr 124 --post          # Post review to GitHub
/review-pr 124 --skip-checks   # Skip automated checks (if CI already green)
```

## Input

`$ARGUMENTS` = PR number (required). Flags: `--post` to post review to GitHub, `--skip-checks` to skip tsc/lint/build.

## Pipeline

### Stage 1: Triage (PR Manager)

Fetch the PR and classify it:

```bash
gh pr view $ARGUMENTS --repo CleanExpo/RestoreAssist --json number,title,body,additions,deletions,headRefName,state,statusCheckRollup
gh pr diff $ARGUMENTS --repo CleanExpo/RestoreAssist
```

Classify using the risk matrix from `/pr-manager`:

| Risk     | File Patterns                                       | Depth          |
| -------- | --------------------------------------------------- | -------------- |
| Trivial  | `.md`, `.gitkeep`, `content/` only                  | Auto-approve   |
| Standard | `app/dashboard/`, `components/`                     | 5 dimensions   |
| Complex  | `app/api/`, `lib/`, multi-domain                    | 10+ dimensions |
| Critical | `prisma/`, `lib/auth.ts`, `lib/stripe.ts`, webhooks | All 18         |

If **Trivial**: output "✅ Auto-approved (trivial change)" and stop.

### Stage 2: Automated Checks

Unless `--skip-checks` is passed or CI is already green:

1. **Check CI status**: `gh pr checks $ARGUMENTS --repo CleanExpo/RestoreAssist`
2. If CI exists and is green, note "✅ CI passing" and continue
3. If CI doesn't exist or is failing, note the status but continue with review

### Stage 3: Dimensional Review (Orchestrator)

Using the activated dimensions from Stage 1, review the diff.

**Dispatch parallel sub-reviews** (up to 6 concurrent agents via the Agent tool):

| Agent Group            | Dimensions Covered                                                       |
| ---------------------- | ------------------------------------------------------------------------ |
| **Architecture Agent** | 1 (Architecture), 8 (State Mgmt), 13 (Code Style)                        |
| **Security Agent**     | 2 (Security), 6 (API Design), 17 (Integration Integrity)                 |
| **Reliability Agent**  | 4 (Error Handling), 5 (Type Safety), 14 (Scalability)                    |
| **Performance Agent**  | 3 (Performance), 12 (Dependency Mgmt), 16 (Migration Safety)             |
| **UX Agent**           | 9 (Accessibility), 18 (UI/UX Consistency)                                |
| **Compliance Agent**   | 7 (Data Modelling), 10 (Testing), 11 (Documentation), 15 (AU Compliance) |

Each agent receives:

- The PR diff (relevant sections only)
- The dimension criteria from `.claude/rules/review-dimensions.md`
- Instruction to return findings as structured JSON:

```json
{
  "dimension": "Security",
  "severity": "Critical",
  "confidence": 92,
  "file": "app/api/admin/users/route.ts",
  "line": 15,
  "description": "Missing authentication check — route is publicly accessible",
  "recommendation": "Add `const session = await getServerSession(authOptions)` at the top of the handler"
}
```

### Stage 4: Synthesis

1. Collect all findings from sub-agents
2. Filter out findings with confidence < 75%
3. Deduplicate — if the same file:line is flagged by multiple dimensions, keep the highest severity
4. Sort by severity: Critical → Important → Suggestion
5. Apply verdict thresholds:
   - **✅ APPROVED**: 0 Critical, ≤ 2 Important
   - **⚠️ CHANGES REQUESTED**: Any Critical OR ≥ 3 Important
   - **💬 NEEDS DISCUSSION**: Architecture concerns requiring Phill's input

### Stage 5: Output

Print the review in the format specified in `/orchestrator-reviewer`.

If `--post` flag is set:

```bash
# For approved:
gh pr review $ARGUMENTS --repo CleanExpo/RestoreAssist --approve --body "REVIEW"

# For changes requested:
gh pr review $ARGUMENTS --repo CleanExpo/RestoreAssist --request-changes --body "REVIEW"

# For needs discussion:
gh pr review $ARGUMENTS --repo CleanExpo/RestoreAssist --comment --body "REVIEW"
```

Also apply labels:

```bash
# Create labels if they don't exist (first run only)
gh label create "reviewed:approved" --repo CleanExpo/RestoreAssist --color 0E8A16 --force 2>/dev/null
gh label create "reviewed:changes-requested" --repo CleanExpo/RestoreAssist --color E11D48 --force 2>/dev/null
gh label create "reviewed:needs-discussion" --repo CleanExpo/RestoreAssist --color FFA500 --force 2>/dev/null
gh label create "risk:trivial" --repo CleanExpo/RestoreAssist --color EDEDED --force 2>/dev/null
gh label create "risk:standard" --repo CleanExpo/RestoreAssist --color 0075CA --force 2>/dev/null
gh label create "risk:complex" --repo CleanExpo/RestoreAssist --color D93F0B --force 2>/dev/null
gh label create "risk:critical" --repo CleanExpo/RestoreAssist --color B60205 --force 2>/dev/null

# Apply labels
gh pr edit $ARGUMENTS --repo CleanExpo/RestoreAssist --add-label "reviewed:approved,risk:standard"
```

## Notes

- This skill can be run multiple times on the same PR (new review overwrites)
- Each sub-agent runs independently — one failing does not block others
- The full pipeline takes 1–3 minutes depending on PR size
- For PRs > 50 files, consider running `/review-batch` with targeted scope instead
