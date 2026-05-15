# SP-6 — Email Provider BYOK (Resend / SendGrid / AWS SES) — design spec — DRAFT for Phill review

> **Status:** Draft. Phill has NOT yet brainstormed this. Treat as a senior consultant's proposal grounded in the shipped SP-E (Storage BYOK) pattern, existing email code audit, and the tenancy-first positioning from the signin-to-close audit. Brainstorm cycle will refine priorities and provider selection.

---

## 0. Context

**Why email BYOK matters:**

1. **Deliverability moat** — RestoreAssist emails (invoices, handover packages, status updates) are business-critical. Shared IP reputation on platform-managed Resend can suffer if other tenants spam or violate ISP rules. Tenants in regulated industries (insurance, licensed restoration) need sender reputation under their own domain.
2. **Envelope compliance** — RA-1548 (email header injection / email validation rules) flags that emails must comply with anti-spoofing (DKIM, SPF, DMARC). Tenant BYOK means the tenant owns their DKIM keys and can achieve DMARC `p=reject` rather than `p=none`.
3. **Volume + analytics** — tenants doing high-volume (>1000 emails/month) pay less at SendGrid / SES than platform Resend. Tenants can tune retry / bounce handling per their SLA.
4. **BYOK theme** — the signin-to-close audit (§10.2) positions BYOK as the core BYOE (Bring Your Own Everything) strategy. SP-E (storage), SP-3 (AI keys), SP-6 (email) form a coherent pillar: the tenant brings infrastructure, RestoreAssist orchestrates.

---

## 1. Existing-code audit

**Current email-send call sites (10 functions in `lib/email.ts`):**

| Function | Trigger | Recipient | Volume/month | Resend dependency |
|---|---|---|---|---|
| `sendSignedFormEmail` | Authority form fully signed | recipients in signatories | ~50 | yes (attachments) |
| `sendInviteEmail` | Admin invites technician | technician email | ~200–500 | yes |
| `sendPaymentFailedEmail` | Stripe webhook `payment_failed` | subscription owner | ~10 | yes |
| `sendSubscriptionCancelledEmail` | User cancels subscription | user email | ~5 | yes |
| `sendTrialExpiringEmail` | Cron: 7 days before trial end | user email | ~50 | yes |
| `sendPasswordResetEmail` | User clicks "Forgot password" | user email | ~100 | yes |
| `sendWelcomeEmail` | After signup or paid conversion | user email | ~200 | yes |
| `sendReportCompletedEmail` | Report generation finishes (unused pathway) | report viewer email | ~0 (draft) | yes |
| `sendSubscriptionActivatedEmail` | Stripe webhook `checkout.session.completed` | user email | ~100 | yes |
| `sendWinbackEmail` | Manual re-engagement campaign | user email | ~20 | yes |

**Plus:** `app/api/invoices/[id]/send/route.ts` (invoice PDF via email), `app/api/notifications/email/route.ts` (generic notification dispatch). Lightweight `sendEmail()` in `lib/email-send.ts` (raw fetch, no SDK).

**Total estimated platform volume:** ~1000–2000 emails/month across all tenants. Resend (platform account) is cost-effective at this scale ($1–5/month). **But:** individual tenants doing invoicing (>500 docs/month) hit SendGrid/SES efficiency at scale.

**Provider library today:** `resend` npm package v6.12.3 (February 2025). No SendGrid or AWS SES SDK imported.

---

## 2. Goal in one sentence

Ship SP-6 v1 so that a tenant can connect their own Resend / SendGrid / AWS SES account at setup or post-launch, and all outbound email (invites, password resets, invoices, notifications) routes through their BYOK provider while respecting failover to platform-managed Resend if BYOK is unreachable (graceful degradation per design principle 3.1).

---

## 3. Locked-in design constraints

1. **Mirror SP-E (Storage BYOK) structure** — provider abstraction interface, fail-soft sync (BYOK unreachable → fallback, log error, no user-facing failure), no double-handling of templates, audit log row per send.
2. **API-key only (Wave 1)** — Resend, SendGrid, SES all authenticate via API key (no OAuth like SP-E's Google Drive). Simpler than SP-E; BYOK setup is "paste your key" in `/dashboard/settings/email`.
3. **Fire-and-forget** — per CLAUDE.md rule 13, email sends are async + logged but don't block route responses. Failures are retryable, not critical-path.
4. **Editability** — templates (invite copy, password-reset link, invoice layout) must remain editable by Phill in `lib/email-templates.ts`. BYOK provider choice does NOT require code changes to templates (migration barrier is zero).
5. **Escape HTML in all user-provided fields** — CLAUDE.md rule 12. Already present in `lib/email.ts` (`escapeHtml` function line 36–43). SP-6 reuses this for all BYOK paths.
6. **DKIM/SPF/DMARC verification at connect time** — when a tenant adds a BYOK key, the system queries the provider's API to confirm the domain is validated + DKIM active. Yellow warning on dashboard if unverified.

---

## 4. Architecture

### 4.1 Provider abstraction interface

Define `lib/email/EmailProvider.ts`:

```ts
export interface EmailProvider {
  /** Send a single email. Fire-and-forget; caller handles retry. */
  send(payload: {
    to: string | string[];
    subject: string;
    html: string;
    replyTo?: string;
    attachments?: Array<{ filename: string; content: string; contentType: string }>;
  }): Promise<{ messageId: string; success: boolean; error?: string }>;

  /** Validate provider connectivity + domain config at connect time. */
  validate(): Promise<{ 
    valid: boolean; 
    domain?: string; 
    dkimActive?: boolean; 
    error?: string;
  }>;
}
```

### 4.2 Three provider implementations (API-key only)

**`lib/email/resend-provider.ts`** (platform default, already imported)
- Uses existing `resend` npm package (v6.12.3)
- `send()` delegates to `Resend.emails.send()`
- `validate()` calls `/v0/domains` API; lists domains tied to the API key; checks DKIM status via provider API
- From email: `${Organization.email || "noreply@restoreassist.app"}`

**`lib/email/sendgrid-provider.ts`** (enterprise BYOK)
- Uses `@sendgrid/mail` npm package (needs adding to package.json)
- `send()` calls `sgMail.send()`
- `validate()` calls GET `/v3/validated_senders` or similar; checks domain ownership
- From email: extract from the tenant's SendGrid account profile or require explicit config

**`lib/email/aws-ses-provider.ts`** (high-volume, cheapest)
- Uses `@aws-sdk/client-ses` (needs adding to package.json)
- `send()` calls `sesClient.sendEmail()`
- `validate()` checks if email is verified in SES account (GET `/v2/email/identities`)
- Requires region config (default `us-east-1`; tenant can override in setup)

### 4.3 Provider dispatcher

`lib/email/index.ts` — `getEmailProvider(organizationId)`:
- Reads `Organization.emailProvider` enum (`RESEND | SENDGRID | SES | PLATFORM_RESEND`)
- Returns instance of corresponding provider
- On error (invalid config, missing credentials), logs + returns platform-Resend fallback

### 4.4 Credential vault wiring

`Organization.emailProviderEncryptedCredentials` — AES-256-GCM encrypted JSON (mirror of SP-E pattern):
```json
{
  "type": "sendgrid",
  "apiKey": "SG.xxxxx"
}
```

Decryption happens inside each provider's constructor (reads token at instantiation, never sent to client).

### 4.5 Fallback chain

1. Tenant has BYOK configured + provider is reachable → **use BYOK**
2. Tenant has BYOK configured but provider is down / invalid → **fall back to platform Resend**, log `[FALLBACK_EMAIL]` with reason
3. Tenant has no BYOK configured → **use platform Resend**

---

## 5. Three providers to support (Wave 1, text-only)

### 5.1 Resend (default, simplest)

- **API:** `https://api.resend.com/emails`
- **Auth:** Bearer token
- **Setup:** "Paste your Resend API key" (from resend.com dashboard)
- **Cost:** $0.00075/email at scale
- **DKIM:** Automatic for verified domains
- **Best for:** small volume, quick setup
- **Downside:** shared IP (unless Resend Pro); limited analytics

### 5.2 SendGrid (enterprise)

- **API:** `https://api.sendgrid.com/v3/mail/send`
- **Auth:** Bearer token
- **Setup:** "Paste your SendGrid API key"
- **Cost:** $9.95–$300/month (volume discount) or PAYG at $0.0001/email
- **DKIM:** Requires domain verification upfront (tenant does via DNS)
- **Best for:** high-volume, advanced analytics, deliverability team
- **Downside:** requires domain DNS access; slight API complexity

### 5.3 AWS SES (cheapest at scale)

- **API:** AWS SDK (`sendEmail` action)
- **Auth:** AWS access key + secret key (or IAM role in production)
- **Setup:** "Paste AWS Access Key ID + Secret Access Key"; select region
- **Cost:** $0.10 per 1000 emails (sandbox = free tier, production requires verification)
- **DKIM:** Automatic + Optional custom MAIL FROM domain
- **Best for:** high-volume (10K+ emails/month), cost-sensitive, existing AWS infra
- **Downside:** most complex setup; requires AWS account; sandbox vs production mode

---

## 6. OAuth vs API key flows

**Locked decision:** all three use **API-key only** in Wave 1.

- **Resend:** no OAuth available; API-key is the only method.
- **SendGrid:** OAuth exists but requires SendGrid OAuth app registration + Phill setup overhead. API-key is simpler for tenants.
- **AWS SES:** no OAuth; Access Key + Secret Key is standard.

**Advantage:** no OAuth callback routing needed (simpler than SP-E). Tenant flow is: Settings → Email → paste key → validate → save.

**Future (Wave 2):** SendGrid OAuth could reduce key-rotation friction; defer.

---

## 7. Prisma additions

### 7.1 Enum

```prisma
enum EmailProviderType {
  PLATFORM_RESEND  // Default; uses platform API key
  RESEND           // Tenant BYOK
  SENDGRID         // Tenant BYOK
  SES              // Tenant BYOK (AWS)
}
```

### 7.2 Organization model extension

```prisma
model Organization {
  // existing fields...

  // SP-6: Email BYOK (additive migration A)
  emailProvider                  EmailProviderType @default(PLATFORM_RESEND)
  emailProviderEncryptedCredentials String?  @db.Text  // AES-256-GCM
  emailProviderDomain            String?            // Validated sender domain (for DKIM check)
  emailProviderDomainVerified    Boolean   @default(false)
  emailProviderLastValidatedAt   DateTime?
  emailProviderValidationError   String?   @db.Text

  // Relations
  emailSendJobs EmailSendJob[]
}
```

### 7.3 New model: `EmailSendJob` (audit + retry queue)

```prisma
model EmailSendJob {
  id                String   @id @default(cuid())
  orgId             String
  organization      Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  // Email metadata
  recipientEmail    String
  subject           String
  htmlBody          String   @db.Text
  fromOverride      String?  // If null, use org's from-email

  // Provider + result
  provider          EmailProviderType
  providerMessageId String?  // The message ID returned by the provider (for tracking)
  status            String   @default("pending") // pending, sent, failed, skipped

  // Retry tracking
  attempts          Int      @default(0)
  lastAttemptAt     DateTime?
  nextAttemptAt     DateTime @default(now())
  lastError         String?  @db.Text

  // Audit
  sentAt            DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([orgId, status])
  @@index([status, nextAttemptAt])
  @@index([createdAt])
}
```

### 7.4 No changes to `User` or `ScheduledEmail`

Existing `EmailConnection` (Gmail/Microsoft auth) and `ScheduledEmail` remain unchanged. SP-6 is orthogonal (outbound BYOK provider, not OAuth connection to user's inbox).

---

## 8. Migration plan

**Migration A (additive, no backfill):**
- Add `EmailProviderType` enum
- Add columns to `Organization` (5 fields)
- Add `EmailSendJob` table

**No data migration needed.** All existing orgs default to `PLATFORM_RESEND`, system behaves as before.

**Backwards compatibility:** the dispatcher's fallback chain means old code paths continue to work without modification (calls `getEmailProvider(orgId)` which returns platform-Resend until tenant opts in).

---

## 9. Implementation path

### 9.1 Dispatcher + abstraction (Phase 1, ~2 days)

1. Create `lib/email/types.ts` — `EmailProvider` interface + `EmailPayload` type
2. Implement `lib/email/resend-provider.ts` — wraps existing SDK
3. Implement `lib/email/sendgrid-provider.ts` — new @sendgrid/mail integration
4. Implement `lib/email/aws-ses-provider.ts` — new @aws-sdk/client-ses integration
5. Create `lib/email/index.ts` — dispatcher, fallback logic, credential decryption
6. Refactor `lib/email-send.ts` to call `getEmailProvider().send()` instead of hardcoded Resend

### 9.2 Prisma + cron queue (Phase 2, ~1 day)

1. Add schema (enum, `Organization` fields, `EmailSendJob` model)
2. Generate migration; apply locally
3. Create `lib/queue/email-send.ts` — `queueEmailSend(...)`, `processNextBatch()`
4. Create `/api/cron/email-send/route.ts` — processes queue every 60s
5. Wire `/vercel.json` cron schedule

### 9.3 Settings page + validation (Phase 3, ~2 days)

1. Create `app/dashboard/settings/email/page.tsx` — connection status block, domain verification status, test-send button
2. Create `/api/email/validate/route.ts` — POST with provider + credentials, returns validation result
3. Create `/api/email/test-send/route.ts` — sends a test email to org owner
4. Credential encryption/decryption helpers (reuse `lib/credential-vault.ts`)
5. Toast notifications on success/failure

### 9.4 All 10 email functions switch to dispatcher (Phase 4, ~1 day)

1. Refactor each `sendXxxEmail(data)` to:
   - Get provider via `getEmailProvider(orgId)` (orgId from context or function param)
   - Call `provider.send(payload)`
   - Enqueue `EmailSendJob` row for audit
   - Catch errors + log, never throw (fire-and-forget rule)

### 9.5 Testing (Phase 5, ~2 days)

- Unit tests for each provider's `send()` and `validate()`
- Integration tests for dispatcher fallback logic
- E2E: setup BYOK → send invite → confirm in provider dashboard
- E2E: provider down → fallback to platform Resend
- CI: linting + type-check clean

---

## 10. Audit log

Every email send writes an `EmailSendJob` row (status, provider, message ID, attempts). Audit log mirrors SP-E pattern (append-only, queryable).

No separate `AuditLog` row (unlike SP-A's lifecycle events) — `EmailSendJob` IS the audit trail.

---

## 11. DKIM / SPF / DMARC verification at provider connect

When tenant pastes API key + clicks "Validate":
1. Instantiate provider with credentials
2. Call `provider.validate()` — hits provider API to list domains + verify DKIM active
3. If unverified: show yellow warning "DKIM not active — configure DNS" with link to provider's docs
4. If verified: green checkmark, store `emailProviderDomainVerified = true` + timestamp

On `/dashboard/settings/email`: show status block with refresh button. Revalidate on manual refresh or nightly cron.

---

## 12. Out of scope (v1)

- **Microsoft Graph** (O365 Outlook BYOK) — candidate for SP-K
- **Postmark, Mandrill, Mailgun** — other providers; lock to 3 for v1
- **Template versioning** — remain in code
- **SMTP relay** — only REST API in v1
- **Multi-region failover** — single region per org (future)
- **Per-email provider override** — all outbound from an org uses the same provider
- **SMS provider BYOK** — separate sub-project (SP-K candidate)

---

## 13. Testing strategy

### 13.1 Unit (Vitest)
- Provider `send()` with mocked HTTP
- Provider `validate()` with mocked API responses
- Dispatcher fallback logic (BYOK down → platform)
- Credential encryption/decryption

### 13.2 Integration (Vitest + Prisma)
- POST `/api/email/validate` with each provider + credentials
- POST `/api/email/test-send` happy path + error path
- Queue cron processes `EmailSendJob` rows, calls provider, marks status
- Retry logic: max 3 attempts, exponential backoff

### 13.3 E2E (Playwright)
- Setup wizard BYOK flow: paste Resend key → validate → save
- Send invite → job lands in SendGrid account (via API check)
- Provider down → fallback to platform Resend (mocked outage)
- Settings page: connection status rendered, test-send button works

### 13.4 Fixture data
- Dummy API keys for each provider (test-only; generate via provider sandbox)
- Mocked provider responses (JSON fixtures)
- Test email addresses (safe@example.com, does-not-bounce@example.com)

---

## 14. Critical files (read-only reference)

- `lib/email.ts` — 10 email functions (all 1000+ LOC)
- `lib/email-send.ts` — lightweight dispatcher (54 LOC)
- `lib/credential-vault.ts` — AES-256-GCM encryption (reuse)
- `app/api/team/invites/route.ts` — sample call site for `sendInviteEmail`
- `app/api/authority-forms/[id]/send-completed/route.ts` — sample call site for `sendSignedFormEmail`
- `prisma/schema.prisma` — User, Organization models (existing; extend Organization)
- `lib/integrations/sync-queue.ts` — SP-E's durable queue pattern (mirror for email queue)

---

## 15. New files to create

| Path | Purpose |
|---|---|
| `lib/email/types.ts` | `EmailProvider` interface + `EmailPayload` type |
| `lib/email/index.ts` | Dispatcher `getEmailProvider(orgId)` + fallback |
| `lib/email/resend-provider.ts` | Resend implementation |
| `lib/email/sendgrid-provider.ts` | SendGrid implementation |
| `lib/email/aws-ses-provider.ts` | AWS SES implementation |
| `lib/queue/email-send.ts` | Durable queue: `queueEmailSend`, `processNextBatch` |
| `app/api/cron/email-send/route.ts` | Vercel cron handler |
| `app/api/email/validate/route.ts` | Provider validation endpoint |
| `app/api/email/test-send/route.ts` | Test-send endpoint |
| `app/dashboard/settings/email/page.tsx` | Settings UI (connection status, test-send button) |
| `lib/email/__tests__/` | Unit tests (providers, dispatcher, encryption) |
| `e2e/email-byok.spec.ts` | E2E: setup BYOK → send → verify |

---

## 16. Verification

SP-6 v1 is shipped when:

1. **Prisma migration applies cleanly** — `pnpm prisma migrate deploy` clean; zero drift
2. **Unit tests green** — `npx vitest run lib/email` (provider implementations, fallback logic)
3. **Integration tests green** — queue processing, retry logic, credential encryption
4. **E2E happy path** — org owner navigates to Settings → Email → pastes SendGrid key → validates → sends invite → invite appears in SendGrid logs within 30s
5. **E2E fallback path** — provider marked invalid/down in settings → invite sends via platform Resend fallback with `[FALLBACK_EMAIL]` log
6. **Settings page renders** — connection status block, test-send button, revalidation works
7. **All 10 email functions route through dispatcher** — code audit confirms no hardcoded `getResendClient()` calls remain
8. **No regressions** — existing email sends (welcome, password reset, etc.) still work for orgs with no BYOK configured
9. **Type-check + lint clean** — `pnpm type-check && pnpm lint`

---

## 17. Dependencies & prerequisites

**No external prerequisites.** SP-E (Storage BYOK) is independent. SP-6 can ship in parallel or after SP-E.

**Package additions needed:**
- `@sendgrid/mail` (existing? verify package.json; if not, add)
- `@aws-sdk/client-ses` (new)

---

## 18. Cross-plan reconciliation notes

**From signin-to-close audit (§10.2):** Email BYOK completes the BYOE (Bring Your Own Everything) pillar. Tenants configure email provider (+ storage + AI keys in SP-3) at setup, system honors them end-to-end.

**From SP-E storage plan:** mirror the dual-write (primary → platform, fallback on BYOK down) and fire-and-forget (async queue, logged but non-blocking) patterns.

**No changes to SP-A, SP-J, SP-G:** they call email functions as before; dispatcher change is transparent.

---

## 19. Open questions for brainstorm

1. **Provider default for new tenants** — recommend Resend (simplest), but Phill may prefer SendGrid (enterprise trust) or SES (cost). Lock during brainstorm.
2. **Custom from-email** — should tenant be able to set a "from" email per organization, or is it derived from `Organization.email`? Recommend per-org config; mock up in settings page.
3. **Domain validation strictness** — should unverified DKIM be a blocker (can't send) or just a warning (yellow banner)? Recommend warning (graceful degradation).
4. **Resend Plan** — platform account is Pay-As-You-Go. Should SP-6 migrate to Resend Pro (dedicated IP) or keep PAYG? Defer unless cost analysis warrants.
5. **Retry window** — how long should `EmailSendJob` retry before giving up? Recommend 24 hours (exponential backoff, max 5 attempts), notify org owner on permanent failure.

---

## 20. Post-approval handoff

After Phill approves this spec:

1. This file lives at `docs/superpowers/specs/2026-05-15-sp-6-email-provider-byok-design.md`
2. Invoke `superpowers:writing-plans` to produce the implementation plan
3. Plan execution via SDD or parallel slots (providers are independent files)

No code implementation before that approval gate clears.

