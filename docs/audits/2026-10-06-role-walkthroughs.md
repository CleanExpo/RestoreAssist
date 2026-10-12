# Role walkthroughs — 2026-10-06

Six persona walkthroughs of RestoreAssist at `main` `bc6acd2`: business owner,
office admin, operations manager, bookkeeper, field technician, and the
homeowner on the client portal.

**How this was done, and what it does not prove.** Each journey was traced by
reading the code — pages, API routes, `lib/`, the Prisma schema and the e2e
specs. Nothing was run: the session had no database and no installed
dependencies, so no page was rendered and no test executed. A finding marked
**confirmed** below was re-read line by line by the reviewing session after the
walkthrough agent reported it; the rest are the walkthrough agents' reading and
should be reproduced on staging before a fix is scoped. None of the six
journeys has a passing end-to-end spec: `invite-tech-happy-path` is `fixme`,
and there are no specs for `/portal`, client creation, assignment, scheduling,
estimates or credit notes.

## Scorecard

| Persona | Verdict | Biggest blocker |
| --- | --- | --- |
| 1. Business owner — purchase → setup → staff | AMBER | Invited staff land on an error banner; setup-wizard ABN never reaches invoices |
| 2. Office admin — setup, clients, jobs, dispatch | RED | Colleagues' clients 404; removed staff keep access to jobs |
| 3. Operations manager — dispatch, scope/quote, training | RED | Cannot review technicians' scopes or estimates; no dispatch board |
| 4. Bookkeeper — setup → invoice → collect → funds | RED | Credit notes collide across tenants; no collections, intakes or funds-finding |
| 5. Field technician — receive job → report → close | RED | Assigned tech cannot write most of the job; offline cold start broken |
| 6. Homeowner — portal link, report, scope, Margot | AMBER | Internal invoice notes exposed; "report ready" with nothing to open |

The pattern behind most of the RED: **records are owned by the user who
created them, not by the organisation.** The list views were moved to
organisation scope (D-023), but the detail, write and child routes behind them
still filter on `userId: session.user.id`. Every multi-user office therefore
sees a list it cannot open, and an assigned technician cannot finish the job
they were dispatched to.

## Critical and High findings

| # | Sev | Persona | Finding | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Critical | Homeowner | Invoice notes labelled "Internal notes (not visible to customer)" are served and rendered on the public invoice link | `app/api/invoices/public/[token]/route.ts:50` selects `notes`; `app/invoices/public/[token]/page.tsx:289-295` renders it; `app/dashboard/invoices/new/page.tsx:696`; schema `Invoice.notes // Internal notes` | confirmed |
| 2 | Critical | Admin | Removing a team member hides their jobs and clients from the office while the ex-employee keeps access | `app/api/team/members/[id]/route.ts:240-252` nulls `organizationId` only; `lib/auth/assert-tenancy.ts` `ownershipClauses` keeps `{ userId }` and matches org by the creator's *current* org; `organizationLeftId` is read only by credits and account deletion | confirmed |
| 3 | Critical | Technician | An assigned technician cannot write most of the job: environmental, affected areas, scope items, sign-off, report PDF and generate-scope all require the job's creator | `app/api/inspections/[id]/{environmental,affected-areas,scope-items,sign,report,generate-scope}/route.ts` use `userId: session.user.id` and none uses `assertInspectionCapturable`/`assertInspectionAssignedWrite`; sketch POST and client-portal-link use creator-only `assertInspectionTenancy` | confirmed (owner clauses present, capturable guards absent) |
| 4 | Critical | Technician | Offline cold start is broken: the service worker precaches `/offline`, which does not exist | `public/sw.js:61`; no `app/offline` | confirmed |
| 5 | High | Admin, Manager | Any technician on a paid plan can overwrite the organisation rate card | `PUT /api/pricing-config` checks only the effective subscription (`route.ts:78-110`), no role; the role gate is UI-only (`lib/auth/dashboard-page-access.ts:22`) | confirmed |
| 6 | High | Bookkeeper | Credit-note numbers are counted per user but unique platform-wide — the second business to issue `CN-2026-0001` gets a 500 | `app/api/invoices/credit-notes/route.ts:115-119`; `prisma/schema.prisma:5018` `@unique` | confirmed |
| 7 | High | Bookkeeper | Recurring invoices never generate — nothing reads `nextInvoiceDate` outside its own CRUD | only `app/api/invoices/recurring/route.ts` and its page reference it; no cron | confirmed |
| 8 | High | Owner | Invited staff get no `WorkspaceMember`; `/api/workspace/status` 404s for them and payment-gate 402s redirect to `/subscribe`, which does not exist | `workspaceMember.create` only in `lib/workspace/provision.ts`; `lib/workspace/payment-gate.ts:146`, `lib/entitlements/require-addon.ts:92`; no `app/subscribe` | confirmed |
| 9 | High | Admin, Bookkeeper | Client detail, portal invitations, invoice detail/PDF/payments, credit notes and generate-invoice are creator-only while their lists are org-wide; invoice numbering is per user, so one business can issue duplicate tax-invoice numbers | `app/api/clients/[id]/route.ts:33`, `app/api/portal/invitations/route.ts:101`, `app/api/invoices/[id]/route.ts:34`, `InvoiceSequence @@unique([userId, year])` | agent-reported |
| 10 | High | Owner | Business identity entered in the setup wizard (`Organization.abn/legalName`) never reaches invoices or report PDFs, which read `User.business*` | `app/api/setup/activate/route.ts:90-100`; `app/api/invoices/[id]/pdf/route.ts:56-86`; `lib/reports/workspace-business.ts` | agent-reported |
| 11 | High | Bookkeeper | Xero webhook normalises on `resourceType` and upper-case `CREATE`/`UPDATE`; Xero's payload uses `eventCategory`/`eventType`, so events are likely all SKIPPED and only the 15-min poll works. Invoices also sync with no `AccountCode` and tracking defaulted to `QLD` | `app/api/webhooks/xero/route.ts:137`; `lib/integrations/xero.ts:110-129` | agent-reported — verify against a recorded Xero payload |
| 12 | High | Manager | The estimate builder starts from hardcoded rates and the server stores client-sent totals; managers cannot review or approve a technician's scope, estimate or variation | `components/EstimationEngine.tsx:102-140`; `app/api/estimates/route.ts:157-170`; `app/api/estimates/[id]/status/route.ts:101` | agent-reported |
| 13 | High | Homeowner | "Your report is ready" banner has no link; scope lists "Restoration work item included" N times; progress bar is the evidence-completeness score, not job progress | `app/portal/[token]/page.tsx:222-274`; `lib/portal/client-status-feed.ts:63-67` | agent-reported |
| 14 | High | Technician | Assigning a job notifies nobody; push tokens are stored and never read | `app/api/inspections/[id]/route.ts:514-620`; `deviceToken` has no reader | agent-reported |
| 15 | High | Owner | No Admin or Accounts role (only `USER`/`MANAGER`/`ADMIN`, ADMIN = owner); no revoke-invite endpoint while pending invites hold a paid seat; 0 included seats with no counter on the team page | `prisma/schema.prisma:901`; `app/api/team/invites/[id]/` has only `resend` | agent-reported |

## Medium findings (abridged)

- **NZ is second-class across money surfaces**: `formatCurrencyCents` hardcodes AUD
  (`lib/formatters.ts:24`); `EstimationEngine.tsx:861` `|| 10`; `damage-report-view.tsx:429`
  `/ 1.1`; assessment PDF `gstRate: 0.1`; Settings ABN field is AU-only so NZBN/IRD
  cannot be saved; portal dates pinned to `en-AU`.
- **Hand-typed IICRC citations** instead of `standardCite()`: `lib/portal/client-videos.ts:31`,
  `lib/compliance/variation-auto-approve.ts:127`, `components/ScopingEngine.tsx:1367`,
  `app/dashboard/field/page.tsx:445,454`, `capture/page.tsx:825`, `QuickMoistureEntry.tsx:296`.
- **Dispatch**: the schedule plots jobs by `createdAt` from the latest 100 and nothing
  links to it; assignment writes `technicianId` but the job list shows `technicianName`;
  no workload board; team-member page shows the whole team's recent jobs.
- **Billing**: an early upgrade from trial charges immediately (no `trial_end`);
  `customer.subscription.created` sets ACTIVE regardless of Stripe status; billing APIs
  are not role-gated.
- **Portal**: link email and header are branded RestoreAssist, not the restorer; the
  staff card shows the *owner's* credentials whoever attends; a link resolves to the
  client's *newest* job, not the one it was sent for; revoke-invitation DELETE has no
  handler; the marketing Margot orb appears on `/invoices/public`.
- **Inbound work**: Ascora webhook only logs; DR/NRPG inbound jobs are owner-only.
- **Dead link**: `/dashboard/reports/[id]/download` (from the completeness page).

## Missing capabilities the brief asked about

| Brief item | State |
| --- | --- |
| Bookkeeper intakes — supplier bills, POs, receipts | No model or route |
| Bank feeds, payout reconciliation | Manual "reconciled" toggle only |
| Progress claims, bill-to-insurer | None |
| Overdue reminders, debtor ageing | Templates exist, never sent; nothing sets `OVERDUE` |
| Finding funds — unbilled work, cash flow | None |
| Grants, R&D tax incentive, instant asset write-off research | None anywhere, Margot included |
| Insurer/broker/loss-adjuster contacts per organisation | None (only the global `InsurerProfile`) |
| SMS to clients, click-to-call/navigate from the job | None |
| On-site presentation mode | None |
| Margot for technicians, grounded in IICRC | RAG assistant exists behind `CONTRACTOR_ASSISTANT_ENABLED`; the visible chatbot is ungrounded and 384px wide |
| Margot for homeowners with Standards answers | Deliberately hidden on `/portal`; no grounded public route |
| Staff portfolios per technician | Owner profile only |
| Company-specific training videos / articles in the portal | Platform defaults only, add-on gated |

## Recommended order

1. **Stop the leaks (this week).** Drop `notes` from the public invoice select (add a
   test that fails if it returns); cut a removed member's `{ userId }` access and keep
   their records visible to the organisation; gate `PUT /api/pricing-config` to
   ADMIN/MANAGER with the DB role re-check.
2. **Let the organisation own its records.** One change unlocks most of the RED rows:
   move clients, invoices, credit notes, portal invitations, scopes, estimates and the
   inspection child routes from `userId` filters onto the existing reach/tenancy
   helpers, and move every field-used write route onto `assertInspectionAssignedWrite`.
   Make invoice and credit-note sequences per organisation. Write the failing
   integration cases first.
3. **Make dispatch and the field loop real.** Notify on assignment, add `app/offline`
   and cache job detail, add call/SMS/navigate to the job header, fix the schedule to use
   `inspectionDate`, and un-`fixme` `invite-tech-happy-path`.
4. **One source for business identity and pricing.** PDFs read the organisation;
   estimates start from `resolveEffectivePricing` and totals are recomputed server-side
   with `lib/gst-rules.ts`.
5. **Product decisions for the founder** (not autonomous work): Accounts/Admin roles;
   whether Margot is offered to homeowners and techs (and on which grounded route);
   whether finance features — bills, reconciliation, collections, grants research — are
   in scope or left to Xero.

## Reproduce on staging before fixing

1. Critical 1: create an invoice with a note, open its public link logged out — the note
   should not appear.
2. Critical 2: remove technician B — B's jobs should stay in A's `/dashboard/inspections`
   and B should get 404 on them.
3. Critical 3: as an assigned USER-role tech on an office-created job, save an affected
   area, a sketch and sign off — each should succeed.
4. High 5: as a USER-role tech, `PUT /api/pricing-config` — expect 403.
5. High 6: issue a credit note in two separate organisations — both should succeed.
