# Public CRM claims and the code behind them

RA-8148, checked against `main` at `60944448` on 02/11/2026. Static reading of the code, not a run against production. `app/__tests__/public-crm-claims.test.ts` fails if the reworded claims return.

RestoreAssist is the CRM, and every page keeps saying so. Leads, stages, tasks and follow-ups arrive under RA-8011. Add that copy in the same change that ships the feature, and remove its pattern from the test.

## Reworded: the code did not back the claim

| Claim | Where | What the code shows | Now reads |
| --- | --- | --- | --- |
| "full CRM" | `homeContent.ts`, `FAQSection.tsx`, `llms.txt`, gallery ("All-in-one CRM") | `model Client` is an address book with status and notes. No Lead, Pipeline, Deal, Task or FollowUp model in `prisma/schema.prisma` | "the Australian-designed CRM" |
| "Australia's first" | `llms.txt` | No evidence held | Removed |
| "One software does all your professional restoration needs" | all four `public/campaigns` pages | Same as above | "One system for your CRM, jobs, scope and quotes" |
| "Can my whole team use it? Yes." | FAQ in `homeContent.ts`, `FAQSection.tsx` | `lib/billing/technician-seats.ts`: the plan includes 0 technician seats | Each field technician needs a paid seat, price read from the add-on |
| "choose a plan that fits your team", "clear packages" | same FAQ | `lib/pricing.ts`: one Monthly Plan | $99 a month, seats and add-ons on top |
| STANDARD, PREMIUM, ENTERPRISE, "1 user", "up to 5 users" | `upgrade-from-trial.mdx`, `connect-xero.mdx` | `lib/pricing.ts`: one plan, no tiers | One plan, paid seats, bookkeeping add-on |
| "$1,188/year", "30 inspection report credits" | `launch-30-in-30.html` | `lib/pricing.ts`: yearly retired, trial is 50 credits | $99 a month, 50 credits |
| QuickBooks and ServiceM8 "integration" drops | `launch-30-in-30.html` | Off by default in `lib/flags/one-crm-flags.ts` | Removed; page is now 11 features |
| MYOB + Xero included in a tier | `upgrade-from-trial.mdx`, `connect-xero.mdx` | MYOB off by default | Removed |
| "Connect Xero or Ascora", "Accounting sync" | `how-it-works/page.tsx` | Ascora is a migration source (RA-7714). Xero needs the bookkeeping add-on (`lib/billing/bookkeeping-addon.ts`) | Xero add-on, Ascora migration add-on |
| "Ascora (existing CRM bridge)" | `llms.txt` | Same | Migration of job history and pricing |
| "Quotes always match current market rates" | gallery | `app/api/calculate` prices through `resolveEffectivePricing`, not the Ascora table | "Bring your Ascora job history and pricing across" |
| "Invoices auto-sync to Xero", "the moment you close an inspection", "within 30 seconds" | gallery, `connect-xero.mdx` | No enqueue on close. `app/api/cron/sync-invoices` runs hourly; `app/api/invoices/[id]/sync` runs by hand | Push by add-on, hourly or from the invoice menu |
| "real-time collaboration" | `app/features/layout.tsx` | No socket, stream or presence code for jobs | "offline field capture" |
| "Real-Time Analytics" | gallery, launch page | `app/dashboard/analytics/page.tsx` fetches once on load | "Analytics", one dashboard |
| "The office sees today's jobs in real time" | gallery | Same search, no live job feed | "reaches the office once you are back online" |
| "Every client and property in one searchable place" | gallery | `app/api/clients/route.ts` searches name, email, phone, company. No Property model | "Find any client by name, email, phone or company" |
| "Clients approve quotes" | gallery | Portal signs authorities and report approvals. Estimate approval is a staff action | "Clients sign approvals and follow progress" |
| "Assign work by verified qualification" | gallery | Certifications are profile data only | "Keep contractor certifications on file" |
| "Your data stays yours, on your own server" | gallery, launch page | Hosted service, no self-host path | Removed |
| "Automatic backup to your own cloud" | gallery | `lib/cloud-mirror` mirrors evidence files only | "Mirror evidence files to your own cloud storage" |
| "Readings flow straight from the meter" | gallery, launch page | `lib/field-device-registry.ts`: no device is verified for direct pairing | Removed |
| "Manage fifty jobs at once" | gallery | Bulk delete, status, duplicate, export | "Update, duplicate or export reports in bulk" |
| "every action logged" | gallery | Audit calls cover some routes, not all | "Key actions recorded in an audit trail" |
| "insurance carrier coordination", "EstimateVariation tracking", Row Level Security per tenant, "IICRC framework compliance" | `llms.txt` | Profiles only; no reader of the model; access is enforced in app queries; the product never claims compliance | Reworded or removed |

## Withheld videos

The YouTube thumbnails carry the old headlines burned into the picture, and the narration is unchanged, so rewording the caption beneath them is not enough. Every video whose old headline was unbacked is off `features-gallery.html` and `launch-30-in-30.html`, listed by id in the test. The launch page is now 11 features and the gallery cards reworded above are gone until each video is re-rendered. That also takes out Business CRM, Job Management and Client Portal, whose features do exist.

## Kept: the code backs the claim

| Claim | Backing code |
| --- | --- |
| Client records and search | `model Client`, `app/api/clients/route.ts`, `app/dashboard/clients/page.tsx` |
| Track a job from inspection to close | `InspectionStatus` in `prisma/schema.prisma`, `app/api/inspections/[id]/close` |
| Offline capture that syncs when back online | `lib/evidence-upload-queue.ts`, `lib/nir-sync-queue.ts` |
| Quote to invoice | `app/dashboard/quote/page.tsx`, `app/api/invoices/[id]/payments/route.ts` |
| Client portal progress and signing | `app/portal/[token]/page.tsx`, `app/api/portal/[token]/authorities/route.ts` |
| Roles: technician view, admin view | `Role` in `prisma/schema.prisma`, `app/dashboard/DashboardShell.tsx` |
| SWMS drafts, WHS incidents, corrective actions | `SwmsDraft`, `WHSIncident`, `WHSCorrectiveAction`, `app/api/whs/[id]/actions/route.ts` |
| Xero push (add-on) | `lib/integrations/xero.ts`, `app/api/cron/sync-invoices/route.ts` |
| Ascora job history and pricing (add-on) | `app/api/ascora/sync/route.ts` writes `ascoraJob`, `ascoraLineItem`, `scopePricingDatabase` |
| Technician seats billed per seat, enforced on invite | `lib/billing/technician-seats-addon.ts`, `assertTechnicianSeatAvailable` in `lib/billing/technician-seats.ts` |

## Left open

| Item | Why it was not changed here | Owner |
| --- | --- | --- |
| `app/terms/page.tsx` section 9 names QuickBooks, MYOB and ServiceM8 | Legal text. Changing a contract is Phill's decision | Phill |
| "Migrate from Ascora" says "clients" (`lib/billing/service-crm-addon.ts`, shown on `/pricing`) | Billing file, founder-set wording. `AscoraClient.syncClients` writes `externalClient`, not `Client` | Phill |
| Video files and captions behind the campaign pages | Narration needs a re-render. Some name integrations that are switched off (`public/videos/captions`) | Marketing |
| "Native iOS & Android App" | Capacitor shell exists in `ios/` and `android/`. Store listing not checked | Phill |
| Founding Trial grants 999 free seats (`lib/billing/founding-trial-grant.ts`) | Billing behaviour, not copy. Sits against "every seat is billed" | Phill |
