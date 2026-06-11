# Client claim portal — "single button" (implementation plan)

**Goal (Phill):** one emailed button/link that gives the client access to their
claim and lets them act: add images + a brief description + evidence, see live
auto-updates from the inspection + other reports, and approve/sign every Authority
their consent requires.

**Researched with:** ultrathink + two opus recon agents. **Key finding:** ~70% of
the substrate exists — the read portal, the _entire_ authority-signing lifecycle,
evidence storage, and Resend email. The work is **unification** + client-facing
write/sign UI + a live feed. Execution: Opus 4.8, TDD, one PR per phase, no auto-merge.

---

## 0. What already exists (reuse, don't rebuild)

| Capability                                                             | Reuse                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client link + revocable token                                          | `ClientPortalAccount` + `lib/portal/lookup-portal-account.ts` (already powers `/portal/[token]`)                                                 |
| Live read view (status timeline, areas, scope, moisture, report-ready) | `app/portal/[token]/page.tsx`, `GET /api/portal/[token]` (strips pricing)                                                                        |
| Authority signing (client role exists)                                 | `AuthorityFormInstance`/`Signature` (CLIENT/PROPERTY_OWNER), `app/api/authority-forms/sign/[token]` (base64 sig + IP/UA + atomic complete + PDF) |
| Evidence storage                                                       | `EvidenceItem` + `lib/storage/supabase-provider.ts` (upload+thumb, signed URLs)                                                                  |
| Email                                                                  | `lib/email-send.ts` / Resend (pattern in `app/api/portal/invitations`)                                                                           |
| Token-gated public write pattern                                       | the homeowner `CaptureToken` flow just shipped                                                                                                   |
| Claim status + progress sources                                        | `Inspection.status`, `InspectionWorkflow.submissionScore`, `ReportApproval`, `AuditLog`                                                          |

---

## 1. Decisions (recommendation leads each)

| #   | Decision                   | Recommendation                                                                                                                                                       |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The single token           | **Reuse `ClientPortalAccount`** (already the client's revocable, rotatable link) as the one capability; verify write/sign scopes against it — not a new token scheme |
| D2  | Client evidence quarantine | **Flag client uploads `client_unverified`** until staff accept (mirror homeowner D4) — never auto-feed the report                                                    |
| D3  | Authority approvals        | **List the claim's `AuthorityFormInstance`s where the client is signatory; sign in-portal** reusing the existing sign route's IP/UA + atomic-complete logic          |
| D4  | Auto-email                 | **Wire Resend** to send the link on the staff "Send client portal" action (infra exists)                                                                             |
| D5  | Pre-launch gate            | **Adversarial security + legal-signature review before the write/sign surface goes live** (client signatures are legally binding) + your sign-off                    |

---

## 2. Phases (one PR each; TDD)

### Phase 1 — the single button (issue + email the link)

Staff action on the inspection: "Send client portal link" → ensure/rotate the
`ClientPortalAccount` token for the claim's client → **auto-email** the
`/portal/[token]` link (Resend) → also surface it to copy. Reuses ClientPortalAccount

- email infra. _Lowest-risk, highest-leverage — this is literally the button._

### Phase 2 — client evidence upload (token-gated)

`POST /api/portal/[token]/evidence` (verify via `lookupPortalAccount`): accept
images + a brief description, upload via `supabase-provider`, create `EvidenceItem`
flagged `client_unverified` (D2). Client upload UI on the portal page (drag/snap +
description), with the homeowner-grade defences (rate-limit, size caps, BotID).

### Phase 3 — unified authority approvals in-portal

`GET /api/portal/[token]/authorities` → the claim's `AuthorityFormInstance`s
needing the client's signature. Portal panel lists them + embedded signature
capture, submitting through the existing sign logic (IP/UA, atomic complete, PDF).

### Phase 4 — live status + updates feed

Extend `GET /api/portal/[token]` with a **client-safe** updates projection
(filtered `AuditLog` → friendly labels), `InspectionWorkflow` progress %, and
pending `ReportApproval` items; add client-side polling to the portal page.

### Phase 5 — security + legal-signature review

Adversarial pass on the token-gated write/sign surfaces (IDOR, token leakage,
double-sign, evidence abuse) + confirm signature legal-capture integrity. Gate to launch.

---

## 3. Guardrails

- One revocable token (D1); never trust a client-supplied claim/inspection id — resolve from the token.
- Client evidence is quarantined (D2); client signatures use the existing legally-grounded capture (IP/UA, atomic, PDF).
- No pricing/staff/cross-claim data on any token-gated client response (the read route already strips pricing — keep that invariant on new routes).
