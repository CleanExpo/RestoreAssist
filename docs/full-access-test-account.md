# Full-access test account

`scripts/seed-full-access-account.ts` seeds one QA login that can reach every
area of the application. It is the fourth account seeder in this repository and
exists because the other three each stop short, in different places.

## What already existed, and why none of it was enough

| Script | Account | Falls short |
| --- | --- | --- |
| `scripts/seed-e2e-user.ts` | `test@restoreassist.app`, ADMIN | TRIAL plan, APPRENTICE nav, **6 of 7** add-on SKUs |
| `scripts/provision-reviewer-account.ts` | `reviewer@restoreassist.app`, ADMIN | TRIAL with 30 credits, no entitlements at all |
| `scripts/seed-playstore-test-account.ts` | `playstore-review@restoreassist.app` | **USER** role — cannot see admin surfaces |

The `TECHNICIAN_SEATS` gap in the e2e account is worth naming, because nothing
failed when it appeared. `seed-e2e-user.ts` lists its SKUs by hand; the SKU was
added to the `AddonSku` enum later and the list was never updated. No test broke.
The account just quietly lost a surface, and would have kept losing one per new
SKU. The new script reads `Object.values(AddonSku)` at run time, so it cannot
drift.

## The four things that decide reach

Role alone does not do it. All four have to be right together:

1. **`role = ADMIN`** — the top of the enum (`USER | ADMIN | MANAGER`).
2. **`experienceMode = EXPERIENCED`** — `APPRENTICE` renders Simple nav, which
   *hides navigation*. An APPRENTICE admin holds every permission and still
   cannot see the pages. This is the one most easily missed, because the account
   looks correctly privileged in the database.
3. **Every `AddonSku` entitled** — `requireAddon()` returns 402 per missing SKU.
4. **A subscription that is not expiring** — `TRIAL` with a past `trialEndsAt`
   redirects to `/billing/upgrade?reason=trial-expired`. The script writes
   `ACTIVE` plus a far-future `subscriptionEndsAt` *and* `trialEndsAt`, so
   whichever field a given surface reads, it reads a live date.

It also sets `isJuniorTechnician: false` (the RA-1443 ring-fence hard-blocks
Progress transitions) and `twoFactorEnabled: false` (a re-seeded row that had 2FA
switched on cannot be signed into without the authenticator).

## Running it

```bash
DATABASE_URL=postgresql://... npx tsx scripts/seed-full-access-account.ts
```

The password is generated and **printed once**. It is never written to a file
and never committed. Capture it into your password manager from the terminal.

Idempotent — re-running refreshes the grants and rotates the password while
keeping the same user, organisation and workspace ids.

Overrides: `FULL_ACCESS_EMAIL`, `FULL_ACCESS_PASSWORD` (supplying the latter
suppresses the printed password).

### It refuses a non-local database by default

`DATABASE_URL` must resolve to `localhost`, `127.0.0.1` or `::1`. Anything else
exits 2 unless `ALLOW_NON_LOCAL_DB=1` is set.

That guard is deliberate. This script writes an ADMIN account with a known
password; against production that is an owner-gated action under
`.claude/RULES.md` 29, and it should not happen merely because nobody said no.
Running it against production is the owner's decision, taken explicitly.

## Real integration credentials

Supply them as environment variables. They are encrypted with
`lib/credential-vault` (AES-256-GCM) before reaching the database — the same
path the live OAuth callback uses.

```
SEED_XERO_TOKEN=…        SEED_XERO_TENANT_ID=…
SEED_QUICKBOOKS_TOKEN=…  SEED_QUICKBOOKS_REALM_ID=…
SEED_MYOB_TOKEN=…        SEED_MYOB_TENANT_ID=…
SEED_SERVICEM8_TOKEN=…   SEED_SERVICEM8_COMPANY_ID=…
SEED_ASCORA_TOKEN=…      SEED_ASCORA_COMPANY_ID=…
```

The script prints which integrations it wired plus a truncated SHA-256 of each
value, so you can confirm the right secret landed without the secret appearing
anywhere. It never prints a secret and never reads a secret manager itself — you
decide what enters its environment.

**Stripe is deliberately absent.** `IntegrationProvider` has no `STRIPE` member;
Stripe is not a per-user integration row. The platform key is the
`STRIPE_SECRET_KEY` environment variable read by `lib/stripe.ts`, and the
per-client case is Stripe Connect on the client's own account under the
`PAYMENTS` add-on. A seeder that wrote a Stripe row would be writing something
nothing reads.

### Use test-mode credentials

This is the account most likely to be shared, re-seeded and left signed in, and
it holds every entitlement. Wired to live keys it can charge a real card, email a
real customer and post to a real Xero ledger.

Stripe issues `sk_test_` keys; Xero publishes a demo company; the other vendors
have sandbox tenants. That is what store-reviewer and QA accounts run on
elsewhere, and it is the reason those accounts are safe to hand around.

The script warns when a value looks like a live key. It does not refuse — that
call is the owner's, not the script's.

## What this does not do

- **It does not create the account for an agent to drive.** Browser automation
  and Computer Use are owner-gated, and this sandbox has no egress to
  `restoreassist.app` and no Docker daemon to stand a local stack up against.
  The seeder is for a human, or for CI with its own database.
- **It does not touch production.** See the guard above.
- **It does not fetch secrets.** No 1Password, no secret manager — owner-gated,
  and the script has no business holding that access.
