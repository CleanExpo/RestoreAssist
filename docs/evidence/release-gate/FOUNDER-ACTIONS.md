# Founder actions - release gate unblocks

Four items only you can do. Each is self-contained: exact URL, exact value, exact place to put it. Total time if you do all four in one sitting: **about 45 minutes.**

Nothing in this document requires an agent. Nothing in it should be handed to an agent - every item involves a credential, a DNS zone, or a production security setting.

| # | Item | Ticket | Time | Blocks |
|---|---|---|---|---|
| 1 | Verify prod RLS on four tables | RA-7098 | 5 min | F1, security posture |
| 2 | Set `ABR_API_GUID` in prod | RA-6678 | 10 min | A3 (P0), all new customer onboarding |
| 3 | Finish `send.restoreassist.app` DNS | RA-6955 | 15 min | A3, all outbound email |
| 4 | Set `SUPABASE_ACCESS_TOKEN` repo secret | (no ticket) | 5 min | F1 - a dark check since 2026-06-22 |

---

## 1. RA-7098 - verify prod RLS (read-only, 5 minutes)

### What this is

Four tables in the prod `public` schema were flagged `rls_disabled_in_public` at ERROR level and were remediated on 2026-08-16. This confirms the fix actually took, against prod rather than against docs - which is the explicit lesson recorded in RA-7098 itself.

### Where to run it

**https://supabase.com/dashboard/project/udooysjajglluvuxkijp/sql/new**

Both queries are `SELECT` only. Neither writes, alters, or deletes anything.

### Query A - is RLS enabled?

```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('SketchRoom','EvidencePin','PortalContent','RoomPlanCaptureReceipt')
ORDER BY c.relname;
```

**Expected: 4 rows, `relrowsecurity = t` and `relforcerowsecurity = f` on every row.**

Any row with `relrowsecurity = f` means that table is still open to the anon key. `EvidencePin` is the one that matters most - evidence data is the insurer-facing artefact the product's defensibility rests on.

If you get fewer than 4 rows, a table name is wrong or the table does not exist. That is a finding, not a pass.

### Query B - are there actually any policies? (do not skip this)

```sql
SELECT c.relname, COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('SketchRoom','EvidencePin','PortalContent','RoomPlanCaptureReceipt')
GROUP BY c.relname
ORDER BY c.relname;
```

**Why this second query exists:** RLS-enabled-with-zero-policies is a *different* state from RLS-disabled, and Supabase reports it separately as `rls_enabled_no_policy`. RA-7098 lists six other tables sitting in exactly that state. A table with RLS on and no policies is locked by default - safe, but inert: it denies everyone, including legitimate service paths. Query A alone cannot tell the two apart.

A `policy_count` of 0 is not automatically wrong here (these tables are served by `service_role`, which bypasses RLS), but you should know which of the four are in that state rather than assume.

### Scope note - three tables or four?

RA-7098, filed 2026-07-27 04:09 UTC, names **three** tables: `SketchRoom`, `EvidencePin`, `PortalContent`. The query above checks **four**.

That is deliberate and not a discrepancy in the ticket. `RoomPlanCaptureReceipt` was created by migration `20260727120000_roomplan_custody_receipt_room_links`, timestamped **later the same day** the ticket was written - the table did not exist when RA-7098 was filed. The four-table query is a strict superset of the ticket's scope and is the correct one to run.

---

## 2. RA-6678 - set `ABR_API_GUID` in production (10 minutes)

### Why this is a P0

`lib/integrations/abr/client.ts:8` reads `process.env.ABR_API_GUID`. When it is unset, every ABN lookup returns `MALFORMED` regardless of whether the ABN is valid. `lib/setup/jobs.ts` then marks the hydration job `status: "ERROR"`, and the organisation's legal name, trading name, ACN and state are never populated.

ABN-anchored setup is the first thing the Play listing promises ("type your ABN once, we hydrate business name, ACN, GST status, state, address"). **Every new production customer currently hits a silently degraded onboarding.**

### Step 1 - get the GUID (5 min, one-time)

Register for the ABR JSON web service at:

**https://abr.business.gov.au/Tools/WebServices**

You register with an ABN and email address and are issued a GUID. It is free. Keep the value in your password manager - do not paste it into a chat, a ticket, or a file in the repo.

### Step 2 - set it in Vercel production (3 min)

**Environment: `Production`** on the Vercel project **`restoreassist`**.

Exact place: **https://vercel.com/dashboard** - select the `restoreassist` project - **Settings > Environment Variables > Add New**.

| Field | Value |
|---|---|
| Key | `ABR_API_GUID` |
| Value | the GUID from step 1 |
| Environments | tick **Production** (tick Preview too if you want sandbox ABN lookups to work) |
| Type | **Sensitive** |

There is a second, optional variable. `ABR_BASE_URL` defaults to `https://abr.business.gov.au/json/` in code, so **leave it unset** unless you have a reason to override it. Setting it to the wrong value is a way to break a working lookup.

CLI alternative, if you prefer - it prompts for the value rather than taking it as an argument, so the GUID never lands in your shell history:

```bash
vercel env add ABR_API_GUID production
```

### Step 3 - redeploy and verify (2 min)

Environment variables are read at build/runtime, so the change does **not** apply to the currently deployed build. Trigger a redeploy from the Vercel dashboard (**Deployments > latest > Redeploy**).

Then verify with a real ABN. Use **your own company's ABN** - you know what the correct hydrated business name looks like, so a wrong result is immediately obvious. Run the lookup through the app's setup flow and confirm the business name, ACN and state populate instead of erroring.

**If it still fails:** the code now distinguishes `CONFIG_ERROR` (GUID missing or rejected) from `MALFORMED` (bad ABN input) - see PRs #1397 and #1965 on the ticket. A `CONFIG_ERROR` means the variable did not reach the running deployment; a `MALFORMED` means the GUID is fine and the ABN was wrong.

---

## 3. RA-6955 - finish `send.restoreassist.app` DNS (15 minutes)

### Read this first - the ticket is out of date, in your favour

RA-6955 was written 2026-07-03. DNS measured live on **2026-08-16** shows two of its claims have since been overtaken:

| Ticket said (2026-07-03) | Measured now (2026-08-16) |
|---|---|
| No `resend._domainkey` DKIM | **DKIM now EXISTS** at `resend._domainkey.send.restoreassist.app` - a valid `p=MIGf…` key is published |
| Zero MX records, so `support@` bounces | **Root MX now EXISTS**: `restoreassist.app MX 1 smtp.google.com` - inbound routes to Google Workspace |

So the remaining work is smaller than the ticket implies. **DNS is hosted at Vercel, not at your registrar** - the nameservers are `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. Editing records at the registrar will do nothing.

### Where to add these

**https://vercel.com/dashboard** - **Domains** - `restoreassist.app` - **DNS**.
Or by CLI: `vercel dns add restoreassist.app <name> <type> <value>`.

### Record 1 - SPF (exact value, type this as-is)

| Field | Value |
|---|---|
| Name | `send` |
| Type | `TXT` |
| Value | `v=spf1 include:amazonses.com ~all` |
| TTL | default (60) |

This value is Resend's standard SPF record and is region-independent - it is safe to type from this document.

### Record 2 - bounce MX (one field you must read from the dashboard)

| Field | Value |
|---|---|
| Name | `send` |
| Type | `MX` |
| Priority | `10` |
| Value | `feedback-smtp.<REGION>.amazonses.com` |

`<REGION>` is the one field I cannot give you, because it depends on which AWS region your Resend domain was created in. It is one of exactly four:

- `feedback-smtp.us-east-1.amazonses.com`
- `feedback-smtp.eu-west-1.amazonses.com`
- `feedback-smtp.ap-northeast-1.amazonses.com`
- `feedback-smtp.sa-east-1.amazonses.com`

**Read the correct one, do not guess:** open **https://resend.com/domains**, click `send.restoreassist.app`, and the MX row shows the exact value. Copy that one. A region mismatch produces a `region-mismatch` verification error in Resend, and two MX records pointing at different regions produces `multiple-regions` - both block verification.

When entering the value in Vercel, enter **only** `send` as the name, not `send.restoreassist.app`, or the zone will append the domain twice.

### Record 3 - DKIM

**Already published. Do nothing.** Verified live 2026-08-16.

### Then verify

Return to **https://resend.com/domains** and click **Verify DNS Records** on `send.restoreassist.app`. Propagation is usually minutes, though Resend allows up to 72 hours.

### Two follow-on defects found while measuring - both worth fixing now

**(a) The From address does not match the verified domain.** `.env.example:178` has:

```
RESEND_FROM_EMAIL="Restore Assist <noreply@restoreassist.app>"
```

That sends from the **root** domain. The DKIM key is on the **`send.` subdomain**. Once `send.restoreassist.app` verifies, mail from `noreply@restoreassist.app` will still not be DKIM-aligned, because the root domain has no DKIM record (confirmed: `resend._domainkey.restoreassist.app` does not resolve). Update the production `RESEND_FROM_EMAIL` in Vercel to an address **on the verified subdomain**, for example `Restore Assist <noreply@send.restoreassist.app>`.

**(b) There are two conflicting DMARC records.** `_dmarc.restoreassist.app` currently returns **both** of these:

```
v=DMARC1; p=none; rua=mailto:dmarc@smtp-staging.mailtrap.net; ruf=mailto:dmarc@smtp-staging.mailtrap.net; rf=afrf; pct=100
v=DMARC1; p=none;
```

Per RFC 7489, when more than one DMARC record is found at a name, receivers treat the domain as having **no DMARC policy at all**. So DMARC is currently doing nothing. Delete one of the two TXT records at `_dmarc` - keep a single record. The Mailtrap reporting addresses in the first one point at a staging host and are worth dropping unless you are actively reading those reports. Once SPF and DKIM are both live and aligned, you can raise the policy from `p=none` to `p=quarantine`.

**(c) Confirm `support@` actually delivers.** Root MX points at Google Workspace, so the mailbox route exists, but that does not prove a `support@restoreassist.app` mailbox or alias has been created. `lib/brand.ts:33` uses that address as the `replyTo` on all product email. Send a test message to it from an outside address and confirm it lands.

---

## 4. Set the `SUPABASE_ACCESS_TOKEN` repository secret (5 minutes)

### Why

The **Supabase advisor gate** has failed **8 consecutive weekly runs since 2026-06-22**. It is the check that watches prod for RLS-disabled public tables and ERROR-level security advisors - the same class of problem as item 1 above. Its failure log:

```
SUPABASE_ACCESS_TOKEN:
SUPABASE_ACCESS_TOKEN is not set — cannot reach the advisors API. Failing closed.
```

The secret is empty. The gate has not looked at prod in eight weeks.

**It also never told you.** The workflow's `Open issue on failure` step calls `gh issue create --label "security"`, and that label does not exist in the repository, so the command fails and no issue is ever filed. Eight failures, zero notifications.

### Step 1 - create the token

**https://supabase.com/dashboard/account/tokens** - **Generate new token**. Name it something like `restoreassist-ci-advisor-gate`. Copy it once; it is not shown again.

### Step 2 - set the secret

**https://github.com/CleanExpo/RestoreAssist/settings/secrets/actions**

Update (or create) the repository secret named exactly **`SUPABASE_ACCESS_TOKEN`** and paste the token as its value.

The workflow defaults `SUPABASE_PROJECT_REF` to the prod ref `udooysjajglluvuxkijp` when unset, so you do not need to set that.

### Step 3 - create the missing label

**https://github.com/CleanExpo/RestoreAssist/labels** - **New label** - name it exactly **`security`**. Without it, the gate's failure notifier stays broken even after the token works.

### Step 4 - prove it works

Do not wait a week for the schedule. Run it on demand:

**https://github.com/CleanExpo/RestoreAssist/actions/workflows/supabase-advisor-gate.yml** - **Run workflow**.

Two possible outcomes, and **both are useful**:

- **Green** - prod has no ERROR-level advisors and no RLS-disabled public tables. That also independently confirms item 1.
- **Red, with named findings in the log** - the gate is working again and has found something real. That is a success for this action; the findings become the next piece of work.

The failure you do **not** want to see again is `SUPABASE_ACCESS_TOKEN is not set`, which means the secret did not take.

---

## Notes on evidence freshness

The release-gate scorer marks an evidence file stale when it is more than 14 days old, and it reads **filesystem modification time**, not the git commit date:

```ts
const stat = fs.statSync(file);
const ageDays = (Date.now() - stat.mtimeMs) / 86_400_000;
```

Practical consequence: a fresh `git clone` or `git checkout` sets every file's mtime to the moment of checkout, so in CI - which runs `actions/checkout` - **every evidence file always reads as 0 days old and the staleness rule never fires**. The thing that actually decides the score is the `status:` value in each file's frontmatter.

So "refresh the evidence" cannot mean touching a timestamp. It means re-establishing that the claim is true and setting `status: pass` honestly. That is why `A3-no-sev1-sev2-open.md` was downgraded from `pass` to `deferred` in this batch: re-running its query returned 20 open Urgent/High issues where the file claimed 0.
