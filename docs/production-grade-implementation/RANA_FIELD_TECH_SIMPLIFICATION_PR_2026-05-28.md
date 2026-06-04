# Rana Final PR Packet — Field Tech iPad Simplification

Date: 2026-05-28
Owner: Rana
Recommended branch: `codex/field-tech-simplified-ipad-nav`
Priority: P0 pilot usability

## PR Title

`fix(field): simplify technician iPad navigation`

## Why

Phill tested the app on iPad after signing in and adding the Anthropic API key. The field-tech experience still felt overwhelming, with too many dashboard options and several actions that looked connected but did not take the technician into the relevant job flow.

This PR pulls the technician surface back to the core jobs-to-evidence workflow before pilot use.

## Scope

Changed files:

- `app/dashboard/layout.tsx`
- `app/dashboard/field/page.tsx`

## Summary

- For `USER` role technicians, replace the full dashboard sidebar with a small field-focused menu:
  - Field Mode
  - Active Jobs
  - New Job
  - Media
  - Help
  - Account
- Keep ADMIN and MANAGER navigation unchanged.
- Replace technician top-bar global search with a direct Field Mode shortcut.
- Hide the How To dropdown and theme toggle from technician users to reduce iPad clutter.
- Replace the field dashboard's disconnected Voice and Camera quick actions with:
  - Continue next job, linking directly to `/dashboard/inspections/{id}/field`
  - Start new job, linking to `/dashboard/inspections/new`
- Add a calm empty state when no active jobs are available.

## Acceptance Checklist

- A technician account sees only the reduced field navigation.
- Admin and manager accounts still see the full operator navigation.
- The field dashboard has no dead `#active` quick actions.
- Continue next job opens the active inspection field workflow.
- Start new job opens the inspection creation flow.
- The screen feels usable on iPad without forcing the technician to choose from the whole platform.

## Test Plan

Run:

```bash
pnpm type-check
pnpm lint
```

Manual iPad checks:

- Sign in as a technician or `USER` role.
- Confirm the sidebar/menu is reduced to field-critical items.
- Confirm top bar shows Field Mode instead of global search.
- Confirm an active job opens from Continue next job.
- Confirm an account with no active jobs shows a simple empty state.
- Sign in as ADMIN/MANAGER and confirm the full dashboard navigation is unchanged.

## Risk / Follow-Up

`USER` currently maps to the technician experience. If the product needs non-technician customer/user roles later, add an explicit technician capability or workspace role gate before expanding beyond pilot.
