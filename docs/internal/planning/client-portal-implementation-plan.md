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
