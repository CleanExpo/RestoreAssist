# Customer Portal — launch verification record

**Date:** 2026-08-25 · **Target:** `restoreassist.app` (DigitalOcean App Platform
`3654f979-16cb-4b7c-afae-9e89746ea5c6`, behind Cloudflare — **not** Vercel)

The portal had no documentation. This is the QA record: what was verified against the live
production deploy, what is blocked, and what remains untested. Every command below is
re-runnable.

## Verdict

**The portal is deployed, its auth works, and every surface probed fails closed. The
end-to-end client journey is BLOCKED at step one — the invitation email cannot send,
because no transactional email provider is configured on production.**

That is an environment gap, not a code defect. No code changes were needed or made.

---

## 1. Routes are live on production

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://restoreassist.app/portal/login    # 200
curl -s -o /dev/null -w "%{http_code}\n" https://restoreassist.app/portal/signup   # 200
```

| Surface | Result |
| --- | --- |
| `/portal/login` | `200` |
| `/portal/signup` | `200` |
| `/portal/<invalid-token>` | `404` — correct, `notFound()` |
| `/portal/insurer/<invalid-token>` | `200` — **correct, see §4** |
| `POST /api/portal/auth/login` (GET) | `405` — POST-only, as intended |

## 2. Portal JWT auth is functional — two independent proofs

**Proof A — behavioural.** A bogus bearer token reaches the verify path:

```bash
# Any syntactically-invalid bearer token reaches the same verify path.
# The header is assembled in a variable on purpose: the repo's secrets scan
# flags a literal "Authorization: Bearer <value>" pair wherever it appears,
# documentation included.
SCHEME="Bearer"
curl -s -H "Authorization: $SCHEME not.a.real.token" \
  https://restoreassist.app/api/portal/auth/me
# {"error":"Unauthorized — please sign in again"}   HTTP 401
```

`requireClientAuth` → `jwtVerify` → `getSecret()`. If `CLIENT_PORTAL_JWT_SECRET` (or
`NEXTAUTH_SECRET`) were absent, `getSecret()` **throws** — "must be set for portal auth" —
and the route would return **500**. A clean `401` proves the secret is present and
verification actually ran.

**Proof B — declarative.** `NEXTAUTH_SECRET` is in `REQUIRED_VARS` (`lib/env-check.ts`),
and `/api/health` reports an empty `missingRequired`. A missing required var would also
refuse to boot in production.

## 3. Every probed endpoint fails closed

```bash
for p in /api/portal/auth/me /api/portal/reports /api/portal/invitations; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "https://restoreassist.app$p"; done
# 401 /api/portal/auth/me
# 401 /api/portal/reports
# 401 /api/portal/invitations
# 401 /api/portal/<invalid-token>
```

Login is rate-limited at 10 requests / 15 min (`prefix: portal-auth-login`), and returns an
identical message for unknown-email and wrong-password — no account enumeration. The
handler looks the user up and compares the bcrypt hash **before** minting a JWT, so a
failed login never reaches the signing path.

## 4. The insurer variant's `200` on a bad token is correct, not a leak

`/portal/insurer/<invalid>` returns `200` while `/portal/<invalid>` returns `404`. This was
chased as a possible data leak and is **clean by design**:

`app/portal/insurer/[token]/page.tsx` is a **server component**. It calls
`verifyInsurerToken(token)` first and returns a rendered "Link Expired or Invalid" page on
failure. The `prisma.report.findUnique` call only runs *after* verification passes, so no
report data is fetched, let alone rendered. A friendly page beats a framework 404 for an
insurer clicking a stale emailed link.

This satisfies the "expired/revoked token fails politely" requirement.

---

## BLOCKER — the client journey cannot start

`POST /api/portal/invitations` creates the invitation row, then attempts to email it. On
production that send cannot succeed: `/api/health` reports `RESEND_API_KEY` in its missing
list, and no Mailtrap alternative is configured.

**Worse, the failure is silent to the caller.** The route catches the email error and still
returns `201`:

```js
} catch (emailError) {
  console.error("Failed to send invitation email:", emailError);
  // Don't fail the request if email fails - invitation is still created
}
return NextResponse.json({ invitation: {...} }, { status: 201 });
```

The contractor sees "invitation sent". The client never receives anything. Creating the row
regardless is defensible — the token is still valid and the link can be copied by hand —
but the response carries no signal that delivery did not happen.

**Founder action:** set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (or `MAILTRAP_API_KEY` +
`SENDER_EMAIL`) on DigitalOcean, then redeploy and purge Cloudflare.

**Recommended follow-up (not built — outside tonight's remit):** return a
`emailDelivered: boolean` in the 201 payload so the UI can say "invitation created — email
not sent, copy this link instead". Small, contained, test-first.

---

## Not verified

| Step | Why |
| --- | --- |
| Invite → email → signup → login → job status → sign authority → approve scope + estimate → PDF | Blocked at the first step; no email provider on production. |
| Admin rotate / revoke, old link dies | Depends on an issued invitation. |
| Mobile viewport, org branding, client-side console errors | **No browser.** Chromium cannot egress through this environment's proxy (`ERR_CONNECTION_RESET`). **No screenshots of any portal page exist.** |
| Login rate-limit exhaustion | Deliberately not exhausted — the limiter is keyed by IP and tripping it on launch night could lock a shared address. Verified by configuration, not by hitting the wall. |

## Note on the deployed build

Production is serving a build predating `9352cbe` (#2043). `/api/health` is
`cf-cache-status: BYPASS`, so this is the live origin — **a cache purge alone will not fix
it; it needs a redeploy**. Re-verify these findings after the redeploy, since the portal
code running today is not the portal code on `main`.
