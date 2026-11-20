# P1 — Operational quality (execution checklist)

Start after **P0 green** on production/staging. Track: RA-P1-1 … RA-P1-7.

| ID | Theme | Done when |
|----|--------|-----------|
| RA-P1-1 | Invite → tech dashboard | W11 + `setup-technician-gate` E2E green with `ALLOW_TEST_HELPERS=true`; `/onboarding/technician` for wizard-gated techs |
| RA-P1-2 | Setup + integrations UX | ABR reassurance + CONFIG_ERROR copy; setup E2E un-skipped in CI |
| RA-P1-3 | Business metrics + first-win % | `/dashboard/admin/business` shows `firstWinRate30d` |
| RA-P1-4 | iOS BillingGate 3.1.1 | TestFlight: no subscribe UI; resubmit notes current |
| RA-P1-5 | Revocable share/portal links | `ReportShareAccess` mint/revoke; legacy HMAC still verifies |
| RA-P1-6 | Golden E2E | `first-tradie-flow` in sketch-e2e workflow |
| RA-P1-7 | ABR production credential | `ABR_API_GUID` on DO; `GET /api/admin/integrations/abr/ping` ok |

Phill attestation: one non-founder completes setup + one tradie loop on staging.
