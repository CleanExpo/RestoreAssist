# Client portal — implementation plan

**Goal:** One emailed link per job so the client can view claim status, upload evidence (staff-reviewed), sign required authorities, and see updates — reusing existing `ClientPortalAccount`, signing, and email infrastructure.

**Status:** Phases 1–4 shipped in product code; phase 5 is security/legal sign-off before external launch marketing.

---

## Existing building blocks

| Capability | Location |
| --- | --- |
| Revocable token | `ClientPortalAccount`, `lib/portal/lookup-portal-account.ts`, `/portal/[token]` |
| Read API | `GET /api/portal/[token]`, `GET /api/portal/[token]/updates` |
| Evidence upload | `POST /api/portal/[token]/evidence` |
| Authorities | `GET /api/portal/[token]/authorities`, `POST /api/authority-forms/sign/[token]` |
| Staff send link | `POST /api/inspections/[id]/client-portal-link` |
| Portal account (JWT) | `/portal/login`, `/api/portal/reports` |

---

## Phases

1. **Send link** — staff action emails `/portal/[token]`; token bound to `inspectionId`.
2. **Evidence** — client uploads quarantined as `client_unverified`.
3. **Authorities** — in-portal list + typed signature via existing sign route.
4. **Live feed** — client-safe status polling on token page.
5. **Launch gate** — adversarial review; no pricing/internal fields on token or JWT surfaces.

---

## Guardrails

- Resolve inspection only from token; never trust client-supplied job ids.
- Interactive links carry expiry; legacy/no-expiry links are read-only.
- Client report APIs omit `totalCost` and approval amounts.

---

## Product strategy (v2)

**Single job URL is the hero path.** Marketing and staff email drive homeowners to `/portal/[token]`. JWT account login (`/portal/login`) stays for multi-report homeowners and legacy flows — not the first-run story for a new claim.

**One poll, two surfaces.** `ClientPortalLiveHub` owns `/api/portal/[token]/updates` polling (with slower interval when the tab is hidden). It renders:

1. **Next step** cards — prioritized actions (approvals → upload → PDF) with in-page anchors (`lib/portal/portal-section-ids.ts`, `lib/portal/homeowner-next-actions.ts`).
2. **Claim status** — progress, drying timeline, pending approvals copy.

**Staff: send gate before send.** `ClientPortalLinkButton` uses the same comms-readiness API as report delivery (`buildClientPortalLinkChecklist`) so contractors fix client email + mail config before hitting send. Re-send refreshes token expiry and surfaces last emailed timestamp from audit.

**Contractor-forward email.** Invite HTML/subject live in `lib/portal/client-portal-invite-email.ts` (testable, reusable for resend templates).

**Launch checklist (next)**

- Playwright: send link → open token → approval anchor visible when pending.
- Theme parity on `/portal/reset-password`, signup, insurer token aliases.
- Phase 5 sign-off + production Mailtrap verification.
