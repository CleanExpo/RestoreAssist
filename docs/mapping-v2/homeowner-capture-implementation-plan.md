# Homeowner self-capture — implementation plan (pre-build, gated)

**Status:** Plan for Phill's sign-off. **No build starts until the 5 decisions in
§1 are signed.** Grounds the merged security design (`homeowner-capture-security-design.md`,
PR #1267) in the actual codebase so execution is instant on approval.

**Researched with:** ultrathink synthesis + two opus discovery agents (public-token
write surface; sketch-editor surface). **Execution model:** Opus 4.8, TDD, one PR per
phase, no auto-merge.

---

## 0. The one reconciliation that matters (read first)

The merged design requires the capture token to be **opaque (no inspection id
embedded), stored hashed at rest, and revocable** (§"Capability-token model").

The repo's existing public token (`lib/portal-token.ts` `verifyPortalToken`) is an
**HMAC-stateless** token that **embeds the signed inspectionId**, is **never stored**,
and is **not revocable**. It powers the read-only portal.

→ **These are incompatible.** Reusing `verifyPortalToken` would violate three design
requirements (opacity, hash-at-rest, revocability). **Decision: the capture token is a
new DB-backed opaque token** (the `UserInvite` model, not the portal model). The build
template is therefore **`app/api/invites/[token]/route.ts:POST`** (DB-backed opaque
token + single-use `$transaction`), **not** the portal route. This matches design
decision D1's own recommendation (new `CaptureToken` table).

---

## 1. Decisions for sign-off (each with my recommendation)

| #   | Decision                  | Recommendation                                                                                                                                                        | Why                                                                                                     |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | Token store               | **New `CaptureToken` table**                                                                                                                                          | Required for opacity + hash-at-rest + revocation (see §0); clean view/write separation                  |
| D2  | Expiry + revoke/extend    | **7-day TTL; staff can revoke (set `revokedAt`) and re-issue (rotate, not mutate)**                                                                                   | Matches portal precedent; rotate-don't-mutate is safer than editing live expiry                         |
| D3  | Rate-limit + size caps    | **10 writes / 10 min keyed by token; `sketchData` ≤ 512 KB; `moisturePoints` ≤ 200; photos (if enabled) ≤ 5 MB, magic-byte checked**                                  | Reuses `applyRateLimit` + existing `MAX_PORTAL_*` caps; token-keyed so one home network isn't IP-locked |
| D4  | Quarantine homeowner data | **YES — persist with `provenance="homeowner_unverified"`; never auto-feed compliance/scope/PDF until a tech promotes it**                                             | Dovetails the existing T1.2/T1.3 provenance guard; protects S500/WHS/scope integrity                    |
| D5  | Sign-off owner + pen-test | **Phill signs; internal adversarial review (`opus-adversary` / `curator-security`) before launch; external pen-test only if scope later grows to homeowner accounts** | Blast radius is one sketch; design mitigations are strong; full pen-test is disproportionate for v1     |

**Phase 0 gate:** nothing in §2 starts until D1–D5 are signed and the owner (D5) is named.

---

## 2. Build phases (TDD; each = one PR; all gated on §1)

### Phase 1 — Schema + token lib (backend only)

- Prisma additive migration (Supabase MCP, prod, checksum-recorded):
  `CaptureToken { id, inspectionId (FK→Inspection, Cascade), tokenHash @unique,
expiresAt, revokedAt?, submittedAt?, createdByUserId, createdAt }`.
- Add quarantine capability per D4: a `provenance="homeowner_unverified"` value on
  `SketchElement` (extends the existing operator_measured/underlay_reference enum) +
  a `reviewStatus` on the submitted `ClaimSketch`.
- `lib/capture-token.ts`: `generateCaptureToken()` → `{ plaintext (32-byte base64url,
256-bit), hash }`; `hashCaptureToken(plaintext)` (SHA-256); `verifyCaptureToken(plaintext)`
  → DB lookup by hash, constant-time, reject expired/revoked → `{ inspectionId } | null`.
- **DoD:** migration applies + round-trips; expired/revoked/unknown rejected; tsc/eslint/no-stub/vitest green.

### Phase 2 — Capture API (the unauthenticated WRITE surface)

- `POST /api/capture/[token]/sketch` — mirrors the invites WRITE pattern:
  `applyRateLimit` (token-keyed) → `verifyBotId` → `validateCsrf` → `verifyCaptureToken`
  → shape/size validation + `sanitizeString` → **resolve inspection from token binding
  only (never client-supplied id)** → upsert `claimSketch` with `provenance=homeowner_unverified`
  - existing `x-client-updated-at` 409 staleness guard → set `submittedAt` in `$transaction`.
- `GET /api/capture/[token]` — read scope only: returns `propertyAddress` + current sketch for display.
- **Tests:** 404 on bad/expired/revoked token; 200 happy path; oversized → 413/422; over-rate → 429;
  client-supplied inspectionId ignored (no IDOR); provenance flag set; staleness → 409.

### Phase 3 — Editor guided mode (no component fork)

- Add to `SketchEditorV2Props`: `mode?: "technician" | "guided"` (default `"technician"`)
  - `saveEndpoint?: string`. Thread `mode` to:
  * `SketchDockToolbar` — filter `TOOLS` to `select, room, text, photo(moisture), pan`.
  * `SketchSelectionPanel` — gate material picker / S500 water-category / WHS gate /
    jurisdiction+NHCover blocks behind `mode === "technician"` (already isolated JSX, L229–393).
  * Hide export / scale-calibration / floor-plan-underlay triggers when guided.
- **Tests (jsdom):** guided hides every technician control + exposes the basic set.

### Phase 4 — Public capture page

- `app/capture/[token]/page.tsx` — server-validates token, loads bound inspection address,
  renders `SketchEditorV2 mode="guided" readonly={false} saveEndpoint="/api/capture/[token]/sketch"`
  inside a guided shell (plain-language instructions + "Submit for your assessor to review").
  No dashboard chrome, no NextAuth.
- **Verify:** valid-token visit → draw → submit → persists quarantined; invalid token → 404.

### Phase 5 — Staff invite + review UI

- Inspection action "Invite homeowner to capture" → creates `CaptureToken` → emails the
  `/capture/[token]` link (reuse existing email infra). Revoke + re-issue controls.
- Tech **review/promote**: view homeowner-submitted sketch, promote provenance
  `homeowner_unverified → operator_measured` (un-quarantine) after verification.

### Phase 6 — Security verification (before launch, per D5)

- `opus-adversary` / `curator-security` adversarial pass on the public write surface
  (IDOR, enumeration, rate-limit bypass, payload abuse, CSRF). Live preview smoke test.
  3-line verification ledger per the quality-first-autonomy memory.

---

## 3. Reuse map (don't reinvent)

| Need                               | Reuse                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| Opaque DB token + single-use write | `app/api/invites/[token]/route.ts:POST` (template)                 |
| Rate limiting                      | `lib/rate-limiter.ts:applyRateLimit` + `getClientIp`               |
| Bot gate                           | `lib/auth/botid.ts:verifyBotId` (not yet used on any public route) |
| CSRF + input sanitize              | `lib/csrf.ts:validateCsrf`, `lib/sanitize.ts:sanitizeString`       |
| Sketch persistence + staleness     | existing `claimSketch` upsert + `x-client-updated-at` guard        |
| Provenance quarantine              | T1.2/T1.3 provenance guard (`lib/sketch/measured-elements.ts`)     |
| Editor                             | `SketchEditorV2` with new `mode` prop — no fork                    |

## 4. Do-NOT (explicit guardrails)

- Do **not** reuse `verifyPortalToken` / the HMAC portal token for writes (see §0).
- Do **not** trust any client-supplied inspection id — resolve from token only.
- Do **not** let homeowner data feed compliance/scope/PDF before tech promotion (D4).
- Do **not** add homeowner accounts/roles/signup — explicitly out of scope.
