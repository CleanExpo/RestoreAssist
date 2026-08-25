# Paid-pilot acceptance tests

Automated checks prove code behaviour. Live checks prove the deployed system,
providers and configuration. Both are required; a unit test does not replace a
live receipt.

The exact automated files are owned by
[`acceptance-manifest.json`](./acceptance-manifest.json) and executed by the
paid-pilot preflight runner.

## A1: signup and identity

**Automated:** registration validation, canonical email identity and existing
account behaviour pass.

**Live:**

1. Register a unique owner email through the public signup flow.
2. Verify the owner can log in, log out and log in again.
3. Verify the session resolves only the intended organisation.
4. Verify a duplicate/case-variant email cannot create a second identity.
5. Record response status, redacted account ID and organisation ID.

**Pass:** one owner, one organisation, one canonical identity and no session
leak. **Fail:** duplicate identity, wrong organisation or bypassed validation.

## A2: payment and entitlement

**Automated:** checkout creation, checkout completion deduplication,
subscription lifecycle and entitlement gate pass.

**Live:**

1. Record Stripe mode, approved price ID and expected GST-inclusive amount.
2. Complete exactly one checkout using the approved operator test method.
3. Confirm exactly one successful Stripe event and one local
   `"SubscriptionEvent"` record with the same `stripeEventId`.
4. Confirm the correct tier/entitlement is active after a fresh login.
5. Exercise cancellation only in the approved test environment; verify access
   follows the documented lifecycle.

**Pass:** charged amount, tier, customer, event and entitlement all match.
**Fail:** duplicate/missing event, wrong charge, wrong mode or stale access.

## A3: owner and technician invites

**Automated:** invite authorisation, concurrent invite uniqueness, resend token
rotation and invite acceptance pass. The DB-backed concurrency case must run in
the release gate; a skipped test is not evidence.

**Live:**

1. Owner invites one unique technician email.
2. Unauthorised users cannot list, create, resend or revoke the invite.
3. Resend once and verify the first link is invalidated.
4. Accept the latest link and verify the technician joins only the intended
   organisation with the intended role.
5. Verify the link cannot be replayed.

**Pass:** one membership, correct role and tenant, old/replayed tokens rejected.
**Fail:** duplicate membership, cross-tenant access or token reuse.

## A4: inspection and report

**Automated:** inspection creation, report provider routing, report package
generation and export controls pass.

**Live:**

1. Create a clearly labelled pilot inspection with non-sensitive sample data.
2. Add moisture readings, equipment and evidence.
3. Generate the selected assessment/report.
4. Download the report and inspect every page for correct customer, property,
   evidence and ownership labels.
5. Verify another pilot cannot view or download the inspection or report.

**Pass:** correct complete report, successful export and tenant isolation.
**Fail:** missing/corrupt output, wrong customer data or access leakage.

## A5: transactional email

**Automated:** provider ambiguity handling, delivery ledger idempotency, invite
identity and retry behaviour pass.

**Live:**

1. Trigger welcome, invite, password-reset and billing email flows once.
2. Record provider message ID/status and the matching delivery ledger record.
3. Verify links use `https://restoreassist.app` and the intended recipient.
4. Verify no token, OAuth secret or full email body appears in logs/evidence.
5. Retry one safe test message and verify idempotency prevents duplicates.

**Pass:** one intended delivery per key, correct recipient and no secret leak.
**Fail:** missing/duplicate delivery, wrong origin/recipient or exposed secret.

## A6: tenant provisioning

**Automated:** target URL validation, approved-host enforcement, database
identity sentinel and tenant-only migration configuration pass.

**Live:**

1. Prove the production scheduler invokes the authenticated provisioning route;
   then approve `TENANT_DATABASE_PROVISIONING_ENABLED=true`. Otherwise A6 stops.
2. Use a newly created, approved empty tenant database.
3. Confirm target hostname is present in `TENANT_DATABASE_HOST_ALLOWLIST`.
4. Start provisioning and record the target fingerprint without recording the
   credential-bearing URL.
5. Verify tenant migrations run with `prisma/tenant/prisma.config.ts` and do
   not run platform migrations.
6. Verify the database identity sentinel before and after migration.
7. Confirm the workspace reaches `READY` only after schema verification.
8. Create and read one tenant-owned sample record; verify another pilot cannot
   read it.

**Pass:** approved host, exact tenant schema, stable identity and isolation.
**Fail:** platform migration, identity change, private/unapproved target,
partial schema or cross-tenant read.

## Evidence requirements

Every live result includes:

- acceptance ID and release revision;
- UTC timestamp and environment;
- customer slot (1–5), never credentials;
- expected and observed result;
- redacted request/provider/database identifiers;
- evidence location and verifier;
- `PASS` or `FAIL` with no `N/A` for A1–A6.
