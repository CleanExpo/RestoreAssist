# Homeowner self-capture — security design & threat model (for sign-off)

**Status:** DRAFT for Phill's security sign-off. **No code in this doc.** Homeowner
self-capture stays gated (spec §2, Phase-2) until this is approved. Grounds the
"public token-WRITE route" risk so the decision can be made on facts.

## Context (verified)

- Today there is a **read-only** homeowner portal (`/app/portal/[token]`,
  `SketchViewer`) — token-gated **view**, no homeowner accounts/roles.
- Staff auth is NextAuth + 2FA (`lib/auth.ts`); homeowners are not users.
- `SketchEditorV2` already supports `readonly`; a capture flow would run it with
  `readonly:false` behind a guided shell.

The new risk vs today: a **public, unauthenticated token that permits WRITES** to a
specific inspection's sketch. This design scopes that risk to acceptable bounds.

## Capability-token model

- A **capture token** is distinct from view tokens: single-purpose, **scoped to ONE
  inspection's sketch**, **expiring** (e.g. 7 days), **revocable**, issued by staff.
- **High entropy** (≥256-bit), stored **hashed** (never plaintext at rest), compared
  in **constant time**. Opaque — no inspection id embedded.
- Carried in the request **body/header, not a cookie** (avoids CSRF-by-cookie).

## Scope of access (least privilege)

A valid capture token grants **only**:

- read + write the **sketch** of its bound inspection (`sketchData`,
  `moisturePoints`, `country`) via a dedicated capture endpoint;
- read that inspection's `propertyAddress` for display.

It grants **nothing** else: no other inspection, no client/staff/billing data, no
listing, no export of staff reports, no role/privilege. The capture endpoint
resolves the inspection **from the token binding only** — never from a client-supplied id.

## Threat model & mitigations

| Threat                      | Mitigation                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Token leaked/shared         | Short expiry + revocable + bound to one inspection; blast radius = that one sketch               |
| Enumeration / guessing      | ≥256-bit opaque token, constant-time compare, return 404 (not 403) on miss                       |
| Privilege escalation / IDOR | Inspection resolved from token binding; no client-supplied id is trusted                         |
| Write spam / DoS            | Rate-limit per token; size cap on `sketchData`/`moisturePoints`; reject oversized payloads       |
| Malicious payload (XSS/PDF) | Server validates shape; PDF text already sanitised (`safe()`, #1264); no HTML rendered from blob |
| Stale/replayed writes       | Reuse the existing `x-client-updated-at` 409 staleness guard                                     |
| CSRF                        | Token in header/body, not ambient cookie                                                         |
| Data exfiltration           | Token reads only its own inspection's sketch + address; nothing cross-tenant                     |

## Out of scope (explicitly)

No homeowner account/role, no password signup, no access to any staff surface. If
full self-service signup is later wanted, that is a separate, larger decision.

## Open decisions for sign-off

1. Token store: **extend `ClientPortalAccount`** with a capability flag, or a **new
   `CaptureToken` table**? (Recommend new table — clean separation of view vs write.)
2. Expiry window + whether staff can extend/revoke from the dashboard.
3. Rate-limit + payload-size limits (values).
4. Whether captured sketches are **quarantined** (flagged "homeowner-submitted,
   unverified") until a tech reviews — recommended, so homeowner data never
   auto-feeds compliance/scope without staff verification.
5. Sign-off owner + whether a pen-test is required before launch.

## Implementation outline (only if approved)

`CaptureToken` (hashed, inspectionId, expiresAt, revokedAt) → staff "invite to
capture" action → emailed link → `/capture/[token]` page verifies token, loads the
bound inspection, renders `SketchEditorV2` (reduced/guided) → writes via a dedicated
`POST /api/capture/[token]/sketch` enforcing all of the above. Reuses the existing
sketch save + staleness guard; adds the token-binding + scoping layer.

---

_Prepared by the build team. This is a design for review, not an approval to build._
