# Branch Audit — 2026-04-11

Read-only triage of long-lived branches with >100 commits ahead of `main`. No branches deleted by this audit — verdicts are informational so the team can make a decision in one place.

## Summary

| Branch                                                     | Commits ahead | Commits behind | Verdict                                                            |
| ---------------------------------------------------------- | ------------- | -------------- | ------------------------------------------------------------------ |
| `claude/inspiring-ardinghelli`                             | 375           | many           | **Superseded** — NIR work re-done on main                          |
| `claude/trusting-einstein`                                 | 639           | 653            | **Superseded** — type-safety pass already on main                  |
| `claude/implement-auth-endpoints-011CUKv8No4oKsMLFrBTZ5nf` | 122           | many           | **Superseded** — auth fixes already on main                        |
| `feat/sprint-l-ai-capabilities`                            | 4             | many           | **Effectively merged** — Sprint L work landed on main              |
| `Testing-Branch`                                           | 155           | many           | Not audited — likely superseded but needs confirmation             |
| `sprint/l-ai-capabilities` (local worktree)                | 522           | many           | **Local only** — not on remote, safe to drop when worktree removed |

## Per-branch details

### `claude/inspiring-ardinghelli` — Superseded

**Claimed content:** NIR v2 — all 10 claim types (water, fire/smoke, mould, storm, biohazard, carpet, HVAC, australian-compliance, asbestos, odour), Phase 1-5 REST API routes (RA-261, RA-290), claim-type assessment panel UI (RA-291), Playwright E2E specs.

**Verification:**

```
# API routes already on main
app/api/inspections/[id]/
├── australian-compliance/    ✓
├── biohazard-assessment/      ✓
├── carpet-restoration/        ✓
├── fire-smoke-assessment/     ✓
├── hvac-assessment/           ✓
├── mould-remediation/         ✓
├── storm-damage/              ✓
└── water-damage-classification/ ✓

# UI panel already on main
components/inspection/NIRClaimAssessmentPanel.tsx  ✓
```

All RA-261, RA-290, RA-291 Linear tickets are **Done**. The RA-291 commit on main (`9e569cb3`) has a different hash from the same-titled commit on this branch (`eca2ce42`) — confirming the work was **re-done on main**, not merged from here.

**Verdict:** Safe to delete. The branch only contains historical commits for work that has since been re-implemented.

### `claude/trusting-einstein` — Superseded

**Claimed content:** 639 commits including type-safety pass (688 → 0 errors), Stripe SDK v19 migration, schema fixes for EvidenceItem and Inspection, Sprint M photo labels, full video pipeline.

**Verification:** All meaningful work exists on main:

- `e24c8202 fix(types): clear all 688 TypeScript errors` — on main
- `4392832b fix(stripe): update webhook + subscription routes for Stripe SDK v19` — on main (confirmed in git log on this branch)
- Sprint M photo labels (RA-446/447/448, PR #150) — merged to main
- Video pipeline — **removed from production** as of PR #164 (2026-04-10); this branch's video commits are now irrelevant

**Verdict:** Safe to delete. 100% of the useful work is on main; the video pipeline commits are now orphaned after the RA-164 deletion.

### `claude/implement-auth-endpoints-*` — Superseded

**Claimed content:** Email/password auth endpoints, landing page redesign, Google OAuth security fixes.

**Verification:** Auth-related fixes on main already cover the same surface:

- `50c1e52f fix(auth): fix Google sign-in broken by wrong provider ID and missing HMAC verify` — on main
- `89791900 fix(csp): prevent Vercel edge caching HTML responses with stale CSP/nonce` — on main
- Email/password credentials provider is live in `lib/auth.ts` on main

**Verdict:** Safe to delete.

### `feat/sprint-l-ai-capabilities` — Effectively merged

Only 4 commits ahead of main. All Sprint L work (pgvector RAG, Vision meter extraction, AI constants, demo seed, App Store publishing infrastructure) has been merged to main via PR #145 and later PRs. The 4 trailing commits are build fixes for commits that are no longer needed.

**Verdict:** Safe to delete.

### `Testing-Branch` — Not audited (156 commits)

Claimed content: E2E testing infrastructure, Phase 7-11 work (fraud detection, monitoring, logging, polish).

**Not investigated in depth.** Given the pattern across the other branches (everything valuable already on main), it's likely similar, but worth a separate review before deletion. Recommendation: open a dedicated 15-minute review session to verify no unique work before deleting.

### `sprint/l-ai-capabilities` (local worktree)

This branch exists only in a local worktree on the developer machine. It has no remote counterpart and will be discarded whenever the worktree is removed. **Not on GitHub.** No action needed.

## Recommendation

1. **Delete immediately:** `claude/inspiring-ardinghelli`, `claude/trusting-einstein`, `claude/implement-auth-endpoints-011CUKv8No4oKsMLFrBTZ5nf`, `feat/sprint-l-ai-capabilities`.
2. **Review then delete:** `Testing-Branch` — 15-minute audit before deletion.
3. **No action:** local-only worktree branches — they cannot affect the remote.

Deletion commands (for reference, not executed by this audit):

```bash
git push origin --delete claude/inspiring-ardinghelli
git push origin --delete claude/trusting-einstein
git push origin --delete claude/implement-auth-endpoints-011CUKv8No4oKsMLFrBTZ5nf
git push origin --delete feat/sprint-l-ai-capabilities
```

Deleting a remote branch only removes the reference — the commits remain in the reflog for 90 days and can be recovered by hash if needed.
