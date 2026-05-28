# Rana Final PR Packet — PM Missing Connections Audit

Date: 2026-05-28
Owner: Rana
Recommended branch: `codex/pm-missing-connections-audit`
Priority: P0 pilot usability

## PR Title

`fix(nav): close missing internal route connections`

## Why

Phill asked for a senior PM walkthrough of the site project-by-project and option-by-option, with 1000 test runs to identify missing connections. The first static connection sweep found broken literal internal routes in onboarding, invite acceptance, invoice templates, and public FAQ links.

## Scope

Changed files:

- `components/FirstRunChecklist.tsx`
- `components/invite/InviteTermsStep.tsx`
- `app/dashboard/invoices/templates/page.tsx`
- `app/faq/page.tsx`
- `scripts/pm-missing-connections-audit.ts`
- `docs/production-grade-implementation/PM_MISSING_CONNECTIONS_AUDIT_2026-05-28.md`

## Summary

- Replaced missing `/dashboard/demo` onboarding CTA with existing `/dashboard/onboarding`.
- Replaced missing `/auth/signin` redirect with existing `/login`.
- Replaced missing legal links `/legal/terms` and `/legal/privacy` with existing `/terms` and `/privacy`.
- Added `/faq` route that redirects to the existing Help surface, preserving public links and sitemap expectations.
- Added a repeatable PM missing-connections audit runner.
- Ran the audit with `--iterations=1000`.

## Audit Result

Command:

```bash
pnpm tsx scripts/pm-missing-connections-audit.ts --iterations=1000
```

Result:

- Literal link validations: 310,000
- Discovered App Router page routes: 169
- Unique missing product-source internal connections: 0

## Acceptance Checklist

- Public `/faq` links resolve instead of 404.
- Invite terms/privacy links resolve.
- Unauthenticated invoice-template users redirect to `/login`.
- First-run checklist no longer points to a missing demo dashboard.
- PM audit report shows zero remaining product-source literal App Router gaps.

## Test Plan

Run:

```bash
pnpm type-check
pnpm exec eslint components/FirstRunChecklist.tsx components/invite/InviteTermsStep.tsx app/dashboard/invoices/templates/page.tsx app/faq/page.tsx
pnpm tsx scripts/pm-missing-connections-audit.ts --iterations=1000
```

Manual checks:

- Open `/faq` and confirm it lands on Help.
- Start invite acceptance and confirm Terms/Privacy open.
- Sign out, open `/dashboard/invoices/templates`, and confirm redirect lands at `/login`.
- Open the first-run checklist and confirm Review onboarding opens an existing dashboard page.

## Risk / Follow-Up

This pass checks static literal links only. Tomorrow's deeper walkthrough should add authenticated browser coverage for role-specific dashboards, field technician job flows, integrations, setup, billing, and report generation.
