# SP-7 Addendum — Seam F: Headshot Upload Pipeline (design)

> **Status:** scoped 2026-05-14.
> **Parent:** SP-7 (PR #1009 — Seams B + C + D), Cloudinary fix (PR #1008).
> **Scope envelope:** < 2 days. Surgical changes only.

## Section 0 — Context

Sub-project #7 shipped the tradie evidence-capture UI (Seams B/C/D). In parallel, PR #1008 fixed the `CLOUDINARY_URL` parsing bug that was making the invite headshot upload return 502s.

"Seam F" in the SP-7 spec was originally just the Cloudinary config bug. Now that the pipeline is unblocked end-to-end, this addendum closes the remaining headshot pipeline gaps that surfaced once the path was actually exercised in prod.

## Section 1 — Existing-code audit

What the headshot pipeline looks like today, post-PR #1008 and post-PR #1009:

| Layer            | File                                                       | State                                                                                                            |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Client validator | `components/invite/headshot-utils.ts`                      | JPEG/PNG type + 5MB size + empty check. Vitest covered.                                                          |
| Client crop      | `components/invite/headshot-utils.ts`                      | `createImageBitmap` primary + `<img>+canvas` fallback for headless Chromium. Vitest covered.                     |
| Client UI        | `components/invite/InviteIdentityStep.tsx`                 | Email-password path. File input, preview, validate-and-crop on change.                                           |
| Client UI        | `app/invite/[token]/page.tsx`                              | Google-OAuth Step 2 path. Same validate-and-crop but inline.                                                     |
| API              | `app/api/invites/[token]/route.ts`                         | Accepts `headshotDataUrl`. Validates `typeof string` + `startsWith("data:image/")`. Uploads via `uploadDataUrl`. |
| API              | `lib/cloudinary.ts` `uploadDataUrl()`                      | Wraps `cloudinary.uploader.upload(dataUrl, { folder: "headshots", resource_type: "image", overwrite: false })`.  |
| Tests            | `app/api/invites/[token]/__tests__/route-extended.test.ts` | 7 cases: missing/invalid phone, missing headshot, ToC, happy path (email+google), google-no-user, etc.           |
| Tests            | `components/invite/__tests__/headshot-utils.test.ts`       | 6 cases on the client validator.                                                                                 |
| Tests            | `components/invite/__tests__/headshot-utils.crop.test.ts`  | 2 cases on the crop fallback.                                                                                    |

## Section 2 — Gaps surfaced

Reviewing the pipeline against the CLAUDE.md rules and the rest of the codebase:

### G1. Magic-byte validation on the server (CLAUDE.md rule 11)

**Rule 11**: _"File uploads must validate magic bytes, not `Content-Type`."_

The server-side check is:

```ts
if (
  typeof body.headshotDataUrl !== "string" ||
  !body.headshotDataUrl.startsWith("data:image/")
) {
  return NextResponse.json({ error: "Headshot is required" }, { status: 400 });
}
```

This is a **prefix check on a client-supplied string**, not magic-byte validation. An attacker can submit `data:image/jpeg;base64,<base64 of an SVG with embedded JS, or arbitrary binary>` and the route hands it to Cloudinary verbatim. The `app/api/upload/logo/route.ts` route — explicitly cited by CLAUDE.md as canonical — decodes the bytes and checks the JPEG/PNG/GIF/WebP signatures.

**Risk** is bounded because Cloudinary itself rejects non-image uploads, but the route should fail closed before the Cloudinary round-trip — both to follow rule 11 and to avoid spending Cloudinary cycles on garbage.

**Fix**: decode the data URL's base64 payload, sniff the first 4–8 bytes against the JPEG (`FF D8 FF`) and PNG (`89 50 4E 47`) signatures (matching the client validator's `image/jpeg` + `image/png` allowlist), reject with 400 on mismatch.

### G2. Payload size bound on the server

The client validator rejects > 5MB pre-crop. The route accepts an arbitrary-length data URL. Since the crop pass clamps output to a 512×512 JPEG at quality 0.9 (~50–200KB typical), legitimate clients send small payloads, but the server has no enforcement.

Next.js App Router default body limit is 1MB on App-Router routes when accessed via `req.json()`; that already implicitly caps payloads. But the limit is a Next-internal 413 from the runtime, not a friendly 400 with a clear error.

**Fix**: after base64-decoding for G1, check decoded byte length against a server cap (6 MB — slightly above client cap to allow base64 overhead). 400 with a clear error.

### G3. Cloudinary upload tagging

`uploadDataUrl()` calls `cloudinary.uploader.upload(dataUrl, { folder: "headshots", resource_type: "image", overwrite: false })` with **no `public_id`** and no `tags`. If a single user retries (e.g. network hiccup → re-submit), each retry creates a new orphaned image with no way for a cleanup job to find them.

**Fix**: allow `uploadDataUrl` to accept an optional `tags` array, and have the invite route pass `["headshot", "invite"]`. Existing `getFilesByTag()` already exists in `lib/cloudinary.ts` for the cleanup-job future.

### G4. Test coverage for G1/G2

Need:

- Unit test: route rejects a `data:image/jpeg;base64,<bytes-that-are-not-jpeg>` payload with 400.
- Unit test: route rejects an oversize payload with 400.

### Out of scope

- **No client changes.** Validators already correct; the crop pipeline works.
- **No DB schema changes.** `User.image` already stores the URL.
- **No Cloudinary cleanup cron.** Tagging only.
- **No retry/idempotency story.** Separate ticket (rule 17).
- **No Cloudinary transformation (face-crop, etc.).** Out of scope.

## Section 3 — What "done" looks like

1. New helper `lib/headshot/validate-data-url.ts` that:
   - Parses `data:<mime>;base64,<payload>` format.
   - Rejects unknown structure.
   - Base64-decodes; checks payload length ≤ 6 MB.
   - Checks magic bytes against JPEG / PNG.
   - Returns a discriminated union `{ ok: true; bytes: Buffer; mime: "image/jpeg" | "image/png" } | { ok: false; error: string }`.
2. `app/api/invites/[token]/route.ts` calls the helper on both paths (email-password + google) before `uploadDataUrl`.
3. `uploadDataUrl` gains an optional `tags?: string[]` parameter; the invite route passes `["headshot", "invite"]`.
4. Tests:
   - New `lib/headshot/__tests__/validate-data-url.test.ts` (~6 cases).
   - Extend `route-extended.test.ts` with 2 new cases: oversize + magic-byte-mismatch.
5. `pnpm type-check` clean. Existing 15 tests still pass.

## Section 4 — Sequencing

1. Scope doc (this file).
2. Write failing test for `validate-data-url` helper.
3. Implement helper.
4. Green.
5. Write failing test extension on route (oversize / magic-byte).
6. Wire helper into route + add Cloudinary tags.
7. Green.
8. Type-check clean. Push.

## Section 5 — Assumptions

- The client-side validator (`validateHeadshotFile`) is the **UX** path; the server check is the **security** gate. Both validate JPEG/PNG, both enforce ~5MB. The server cap is set to 6 MB to absorb base64 overhead.
- The `data:image/...;base64,...` MIME prefix is informational on the wire — the magic-byte check is authoritative. If the prefix says PNG and the bytes are JPEG, we accept (Cloudinary normalises). If the prefix says JPEG and the bytes are PDF, we reject.
- We treat `overwrite: false` + auto-generated public_id as intentional (per the existing `uploadDataUrl` signature). Tagging is purely for downstream cleanup; no behavioural change for the happy path.

## Section 6 — Risk

Low. Surgical: one new ~50-line helper, one route edit (3 small touches), one `lib/cloudinary.ts` signature extension, three new test cases. No DB, no schema, no UI, no integration fan-out.
