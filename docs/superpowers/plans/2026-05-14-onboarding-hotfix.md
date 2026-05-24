# Onboarding Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the P0 broken-promise gap in the setup wizard: `StorageCard` advertises Google Drive but `/api/oauth/google-drive/start` does not exist. Build the missing OAuth 2.0 PKCE start + callback routes against the user's own Google account, persist the choice on `Organization`, store the refresh token encrypted at rest, and replace the StorageCard `TODO` with a real "Connected as `<gmail>`" success surface. Scope: 1 PR, ~2 days. The full Storage BYOK dual-write pipeline (SP-E) is explicitly out of scope.

**Architecture:** Two new App Router route handlers `app/api/oauth/google-drive/start/route.ts` (PKCE generation + redirect to Google) and `app/api/oauth/google-drive/callback/route.ts` (code exchange → token storage → redirect to `/setup`). Reuse the existing `OAuthStateNonce` model + `generateOAuthState` / `validateOAuthState` / `generatePKCE` helpers from `lib/integrations/oauth-handler.ts` rather than inventing a new state machine. Extend the existing `StorageProviderType` Prisma enum with three values (`GOOGLE_DRIVE`, `ONEDRIVE`, `LOCAL`) and add three encrypted token columns + a connected-account email column on `Organization`. Encrypt at rest via `lib/credential-vault.ts` (AES-256-GCM, already present). Refactor `StorageCard.tsx` from a UI-only choice into a real connect-state surface fed by a tiny `GET /api/oauth/google-drive/status` endpoint and the existing setup store. One additive Prisma migration.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + PostgreSQL, NextAuth (existing session), `googleapis` ^166 + `google-auth-library` ^10 (already installed), AES-256-GCM via `lib/credential-vault.ts`, shadcn/ui, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md` §4.1 (and §3.2 framing).

---

## File Structure

### Files to CREATE

- `prisma/migrations/20260514100000_storage_provider_google_drive/migration.sql` — additive: extend `StorageProviderType` enum with `GOOGLE_DRIVE | ONEDRIVE | LOCAL`; add `Organization.storageProviderRefreshToken`, `storageProviderAccessToken`, `storageProviderTokenExpiresAt`, `storageProviderAccountEmail`.
- `app/api/oauth/google-drive/start/route.ts` — `GET` handler that resolves session, generates a DB-backed state nonce + PKCE pair, persists `codeVerifier` against the org row (transient), redirects to Google's `accounts.google.com/o/oauth2/v2/auth` with `drive.file` + `drive.appdata` scopes.
- `app/api/oauth/google-drive/start/__tests__/route.test.ts` — integration tests: unauth → 401, no-org → 302 to `/setup?error`, happy path returns redirect with valid `state` + `code_challenge`.
- `app/api/oauth/google-drive/callback/route.ts` — `GET` handler that validates state, looks up the org's stored PKCE verifier, exchanges code for tokens via `google-auth-library`'s `OAuth2Client`, fetches user-info to capture connected gmail, persists `storageProvider=GOOGLE_DRIVE` + encrypted tokens + account email, clears the transient verifier, redirects to `/setup?storage=connected`.
- `app/api/oauth/google-drive/callback/__tests__/route.test.ts` — integration tests: missing `code`/`state` → redirect with error; replay-nonce blocked; invalid PKCE rejected; happy path writes row with `storageProvider=GOOGLE_DRIVE`, encrypted refresh token round-trips through `decrypt`.
- `app/api/oauth/google-drive/status/route.ts` — `GET` handler returning `{ connected: boolean, accountEmail: string | null, provider: 'GOOGLE_DRIVE' | 'LOCAL' | null }` for the session-user's org. Used by the refactored card.
- `app/api/oauth/google-drive/status/__tests__/route.test.ts` — integration tests for the three states (connected, local, none).
- `lib/storage/google-drive-oauth.ts` — small wrapper exporting `buildGoogleDriveAuthUrl({ state, codeChallenge, redirectUri })`, `exchangeCodeForTokens({ code, codeVerifier, redirectUri })`, `fetchGoogleUserEmail(accessToken)`. Keeps `googleapis` import surface in one file so tests can mock it cleanly.
- `lib/storage/__tests__/google-drive-oauth.test.ts` — unit tests: URL builder includes correct scopes + PKCE params; exchange + fetch-email correctly map response shapes.
- `e2e/setup-storage-google-drive.spec.ts` — Playwright happy-path: sign in → land on `/setup` → click "Connect Google Drive" → mock Google OAuth → return to `/setup` → assert StorageCard shows "Connected as test@example.com" badge and section state is `ready`.

### Files to MODIFY

- `prisma/schema.prisma` — extend `StorageProviderType` enum with `GOOGLE_DRIVE`, `ONEDRIVE`, `LOCAL`; add four columns to `Organization` (`storageProviderRefreshToken`, `storageProviderAccessToken`, `storageProviderTokenExpiresAt`, `storageProviderAccountEmail`).
- `components/setup/StorageCard.tsx` — remove both `TODO(setup-wizard Phase 8+)` comments; replace the `useState<Choice>` with an effect that reads from `/api/oauth/google-drive/status` on mount; render `Connected as <email>` row + `Disconnect` button when `provider === 'GOOGLE_DRIVE'`; keep the three-option grid when `connected === false`. Wire `setSectionStatus('storage', 'ready')` when connected.
- `lib/storage/index.ts` — extend the `switch (org.storageProvider)` to include `GOOGLE_DRIVE` and `LOCAL` cases. For both, fall back to the existing `SupabaseStorageProvider` for now (SP-E will swap in the real GDrive provider). This guarantees no regression — photo uploads continue to work the moment a tenant connects Drive, they just stay in Supabase until SP-E ships.
- `.env.example` — add `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI` (or document re-use of the existing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` with a comment that the redirect URI for the Drive scope flow is `${NEXTAUTH_URL}/api/oauth/google-drive/callback`).

### Files NOT touched in this PR

- `lib/storage/supabase-provider.ts`, `lib/storage/s3-provider.ts`, `lib/storage/types.ts` — SP-E territory.
- `lib/credential-vault.ts` — already provides what we need.
- `app/api/integrations/oauth/[provider]/*` — distinct flow (Xero/MYOB/QB/SM8/Ascora); we deliberately don't extend it because that route is gated behind `checkIntegrationAccess` paid-subscription guard, which is wrong for first-run setup wizard storage choice.

---

## Task Map

| #   | Task                                                          | Phase        |
| --- | ------------------------------------------------------------- | ------------ |
| 1   | Prisma migration (enum extension + 4 columns)                 | Foundation   |
| 2   | `lib/storage/google-drive-oauth.ts` + tests                   | Foundation   |
| 3   | `GET /api/oauth/google-drive/start` + tests                   | API          |
| 4   | `GET /api/oauth/google-drive/callback` + tests                | API          |
| 5   | `GET /api/oauth/google-drive/status` + tests                  | API          |
| 6   | `lib/storage/index.ts` switch-case extension                  | API          |
| 7   | `StorageCard.tsx` refactor — remove TODOs, real connect state | UI           |
| 8   | `.env.example` documentation                                  | Foundation   |
| 9   | E2E `setup-storage-google-drive.spec.ts`                      | Verification |
| 10  | Verification-Gate manual smoke (§4.1 acceptance)              | Verification |

---

## Task 1: Prisma migration — storage provider extension

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260514100000_storage_provider_google_drive/migration.sql`

- [ ] **Step 1: Edit `prisma/schema.prisma` — extend the enum**

Locate `enum StorageProviderType` near line 5221. Add three values:

```prisma
enum StorageProviderType {
  SUPABASE
  S3
  GCS
  AZURE
  GOOGLE_DRIVE
  ONEDRIVE
  LOCAL
}
```

- [ ] **Step 2: Edit `prisma/schema.prisma` — add columns to `Organization`**

Locate `model Organization` near line 825. Immediately after `storageBucketUrl`, add:

```prisma
  // Onboarding hotfix (2026-05-14): BYOK Google Drive OAuth (SP-1 patch)
  storageProviderRefreshToken    String?   // AES-256-GCM via lib/credential-vault.ts
  storageProviderAccessToken     String?   // AES-256-GCM; short-lived, refreshable
  storageProviderTokenExpiresAt  DateTime?
  storageProviderAccountEmail    String?   // The gmail the user OAuth'd as — shown on StorageCard
  storageProviderPkceVerifier    String?   // Transient: cleared on successful callback
```

- [ ] **Step 3: Create the migration**

Run: `pnpm prisma migrate dev --name storage_provider_google_drive --create-only`

Rename the produced directory to `prisma/migrations/20260514100000_storage_provider_google_drive/` if Prisma emitted a different timestamp.

Replace the generated `migration.sql` contents with explicit, deploy-safe SQL:

```sql
-- AlterEnum (additive: never drops existing values)
ALTER TYPE "StorageProviderType" ADD VALUE IF NOT EXISTS 'GOOGLE_DRIVE';
ALTER TYPE "StorageProviderType" ADD VALUE IF NOT EXISTS 'ONEDRIVE';
ALTER TYPE "StorageProviderType" ADD VALUE IF NOT EXISTS 'LOCAL';

-- AlterTable
ALTER TABLE "Organization"
  ADD COLUMN "storageProviderRefreshToken" TEXT,
  ADD COLUMN "storageProviderAccessToken" TEXT,
  ADD COLUMN "storageProviderTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "storageProviderAccountEmail" TEXT,
  ADD COLUMN "storageProviderPkceVerifier" TEXT;
```

The `ADD VALUE IF NOT EXISTS` form is Postgres-13+ safe and re-runnable.

- [ ] **Step 4: Verify additivity**

Open the migration. Confirm: no `DROP`, no `NOT NULL` on new columns, no default values that would force a table rewrite. All five new columns are nullable.

- [ ] **Step 5: Run + commit**

```bash
pnpm prisma migrate dev
pnpm prisma:generate
pnpm type-check
git add prisma/schema.prisma prisma/migrations/20260514100000_storage_provider_google_drive/
git commit -m "feat(prisma): extend StorageProviderType + add Organization OAuth columns (onboarding hotfix)"
```

Expected: type-check passes (no callers reference the new columns yet).

---

## Task 2: `lib/storage/google-drive-oauth.ts` + unit tests

**Files:**

- Create: `lib/storage/google-drive-oauth.ts`
- Create: `lib/storage/__tests__/google-drive-oauth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/storage/__tests__/google-drive-oauth.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildGoogleDriveAuthUrl } from "../google-drive-oauth";

describe("buildGoogleDriveAuthUrl", () => {
  it("includes drive.file + drive.appdata scopes", () => {
    const url = buildGoogleDriveAuthUrl({
      state: "abc",
      codeChallenge: "xyz",
      redirectUri: "http://localhost:3000/api/oauth/google-drive/callback",
      clientId: "test-client-id",
    });
    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope") ?? "";
    expect(scope).toContain("https://www.googleapis.com/auth/drive.file");
    expect(scope).toContain("https://www.googleapis.com/auth/drive.appdata");
  });
  it("sets PKCE method S256 + code_challenge", () => {
    const url = buildGoogleDriveAuthUrl({
      state: "abc",
      codeChallenge: "xyz",
      redirectUri: "http://x",
      clientId: "id",
    });
    const p = new URL(url).searchParams;
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toBe("xyz");
    expect(p.get("state")).toBe("abc");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
  });
});
```

Run: `pnpm vitest run lib/storage/__tests__/google-drive-oauth.test.ts` → fails (module not found).

- [ ] **Step 2: Minimal implementation**

Create `lib/storage/google-drive-oauth.ts`:

```ts
import { google } from "googleapis";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.appdata",
  "openid",
  "email",
];

export function buildGoogleDriveAuthUrl(opts: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(opts: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}> {
  const client = new google.auth.OAuth2(
    opts.clientId,
    opts.clientSecret,
    opts.redirectUri,
  );
  const { tokens } = await client.getToken({
    code: opts.code,
    codeVerifier: opts.codeVerifier,
  });
  return {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

export async function fetchGoogleUserEmail(
  accessToken: string,
): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}
```

- [ ] **Step 3: Run unit tests**

`pnpm vitest run lib/storage/__tests__/google-drive-oauth.test.ts` → PASS.

- [ ] **Step 4: Type-check + lint**

`pnpm type-check && pnpm lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/google-drive-oauth.ts lib/storage/__tests__/google-drive-oauth.test.ts
git commit -m "feat(storage): add Google Drive OAuth URL + token-exchange helpers"
```

---

## Task 3: `GET /api/oauth/google-drive/start`

**Files:**

- Create: `app/api/oauth/google-drive/start/route.ts`
- Create: `app/api/oauth/google-drive/start/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Cover: (a) unauth → 401; (b) authed-with-org → 302 to Google's auth URL with correct state+challenge; (c) `Organization.storageProviderPkceVerifier` is set. See task body for exact test pattern.

- [ ] **Step 2: Minimal implementation**

Implement `app/api/oauth/google-drive/start/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { generatePKCE } from "@/lib/integrations/oauth-handler";
import { buildGoogleDriveAuthUrl } from "@/lib/storage/google-drive-oauth";

export async function GET(request: NextRequest | Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.redirect(
      new URL(
        "/setup?error=no-org",
        process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      ),
    );
  }
  const clientId =
    process.env.GOOGLE_DRIVE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL(
        "/setup?error=drive-not-configured",
        process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      ),
    );
  }
  const nonce = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.oAuthStateNonce.create({
    data: {
      nonce,
      userId: session.user.id,
      provider: "GOOGLE_DRIVE",
      expiresAt,
    },
  });
  const { codeVerifier, codeChallenge } = generatePKCE();
  await prisma.organization.update({
    where: { id: org.id },
    data: { storageProviderPkceVerifier: codeVerifier },
  });
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/oauth/google-drive/callback`;
  const authUrl = buildGoogleDriveAuthUrl({
    state: nonce,
    codeChallenge,
    redirectUri,
    clientId,
  });
  return NextResponse.redirect(authUrl);
}
```

- [ ] **Step 3: Run tests** → PASS.
- [ ] **Step 4: Type-check** → PASS.
- [ ] **Step 5: Commit**

```bash
git add app/api/oauth/google-drive/start/
git commit -m "feat(api): GET /api/oauth/google-drive/start — PKCE OAuth kickoff"
```

---

## Task 4: `GET /api/oauth/google-drive/callback`

**Files:**

- Create: `app/api/oauth/google-drive/callback/route.ts`
- Create: `app/api/oauth/google-drive/callback/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Cover: missing code → 302 to `/setup?error`; replayed nonce → 302 to `/setup?error`; happy path → 302 to `/setup?storage=connected`, `Organization` row has `storageProvider='GOOGLE_DRIVE'`, refresh token round-trips through `decrypt`, `storageProviderPkceVerifier` is cleared.

- [ ] **Step 2: Minimal implementation**

Create `app/api/oauth/google-drive/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateOAuthState } from "@/lib/integrations/oauth-handler";
import { encrypt } from "@/lib/credential-vault";
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
} from "@/lib/storage/google-drive-oauth";

const SETUP_URL = (p: string) =>
  new URL(p, process.env.NEXTAUTH_URL ?? "http://localhost:3000");

export async function GET(request: NextRequest | Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError)
    return NextResponse.redirect(
      SETUP_URL(`/setup?error=${encodeURIComponent(oauthError)}`),
    );
  if (!code || !state)
    return NextResponse.redirect(
      SETUP_URL("/setup?error=missing-code-or-state"),
    );

  const stateData = await validateOAuthState(state);
  if (!stateData || stateData.provider !== "GOOGLE_DRIVE") {
    return NextResponse.redirect(SETUP_URL("/setup?error=invalid-state"));
  }

  const org = await prisma.organization.findFirst({
    where: { ownerId: stateData.userId },
    select: { id: true, storageProviderPkceVerifier: true },
  });
  if (!org?.storageProviderPkceVerifier) {
    return NextResponse.redirect(SETUP_URL("/setup?error=missing-pkce"));
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: org.storageProviderPkceVerifier,
      redirectUri: `${process.env.NEXTAUTH_URL}/api/oauth/google-drive/callback`,
      clientId: (process.env.GOOGLE_DRIVE_CLIENT_ID ??
        process.env.GOOGLE_CLIENT_ID)!,
      clientSecret: (process.env.GOOGLE_DRIVE_CLIENT_SECRET ??
        process.env.GOOGLE_CLIENT_SECRET)!,
    });
    const email = await fetchGoogleUserEmail(tokens.accessToken);

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        storageProvider: "GOOGLE_DRIVE",
        storageProviderAccessToken: tokens.accessToken
          ? encrypt(tokens.accessToken)
          : null,
        storageProviderRefreshToken: tokens.refreshToken
          ? encrypt(tokens.refreshToken)
          : null,
        storageProviderTokenExpiresAt: tokens.expiresAt,
        storageProviderAccountEmail: email,
        storageProviderPkceVerifier: null,
      },
    });

    return NextResponse.redirect(SETUP_URL("/setup?storage=connected"));
  } catch (err) {
    console.error("[google-drive/callback] exchange failed:", err);
    return NextResponse.redirect(
      SETUP_URL("/setup?error=token-exchange-failed"),
    );
  }
}
```

- [ ] **Step 3: Run tests** → PASS.
- [ ] **Step 4: Type-check** → PASS.
- [ ] **Step 5: Commit**

```bash
git add app/api/oauth/google-drive/callback/
git commit -m "feat(api): GET /api/oauth/google-drive/callback — persist encrypted tokens"
```

---

## Task 5: `GET /api/oauth/google-drive/status`

**Files:**

- Create: `app/api/oauth/google-drive/status/route.ts` + tests.

- [ ] **Step 1: Write the failing test** for three cases (unauth/no-org/connected).
- [ ] **Step 2: Minimal implementation**

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const org = await prisma.organization.findFirst({
    where: { ownerId: session.user.id },
    select: { storageProvider: true, storageProviderAccountEmail: true },
  });
  if (!org)
    return NextResponse.json({
      connected: false,
      provider: null,
      accountEmail: null,
    });
  const connected = org.storageProvider === "GOOGLE_DRIVE";
  return NextResponse.json({
    connected,
    provider: org.storageProvider,
    accountEmail: org.storageProviderAccountEmail,
  });
}
```

- [ ] **Step 3: Run tests + type-check** → PASS.
- [ ] **Step 4: Commit**

```bash
git add app/api/oauth/google-drive/status/
git commit -m "feat(api): GET /api/oauth/google-drive/status — connect-state read for StorageCard"
```

---

## Task 6: Extend `lib/storage/index.ts` switch

**Files:** Modify `lib/storage/index.ts`.

- [ ] **Step 1: Add cases for new enum values**

```ts
switch (org.storageProvider) {
  case "S3":
  case "GCS":
  case "AZURE":
    return new ExternalS3Provider(org.storageBucketUrl ?? "");
  case "GOOGLE_DRIVE":
  case "ONEDRIVE":
  case "LOCAL":
    // SP-E will wire real providers. Until then, fall through to Supabase
    // so uploads keep working the moment a tenant connects Drive.
    return new SupabaseStorageProvider();
  case "SUPABASE":
  default:
    return new SupabaseStorageProvider();
}
```

- [ ] **Step 2-5: Run tests, type-check, commit.**

---

## Task 7: Refactor `StorageCard.tsx`

**Files:** Modify `components/setup/StorageCard.tsx`.

- [ ] **Step 1:** Strip the two `TODO(setup-wizard Phase 8+)` comments. The OAuth path is now real; the comments lie.
- [ ] **Step 2:** Replace `useState<Choice>` with a `useEffect` that calls `GET /api/oauth/google-drive/status` and stores `{ connected, provider, accountEmail }` in local state. While loading, render a skeleton; once loaded, branch on `connected`.
- [ ] **Step 3:** When `connected === true && provider === "GOOGLE_DRIVE"`: render a row with a green check, "Connected as `{accountEmail}`", and a "Switch storage" link that resets the local view back to the three-option grid. On mount with `connected=true`, call `setSectionStatus('storage', 'ready')`.
- [ ] **Step 4:** When disconnected, keep the existing three-option grid. Clicking "Google Drive" now navigates to `/api/oauth/google-drive/start`. "Local" calls `setSectionStatus('storage', 'ready')` (DB persistence deferred to SP-E).
- [ ] **Step 5:** Read `?storage=connected` and `?error=*` from `useSearchParams()`. On success, force a fresh status fetch + show success toast. On error, render the option grid with the error message inline.
- [ ] **Step 6:** Visual + lint + type-check + commit.

---

## Task 8: `.env.example` documentation

- [ ] Add the three env vars (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`) under the existing Google block with a comment about reusing `GOOGLE_CLIENT_ID`/`SECRET` if the redirect URI is added to the same OAuth client.

---

## Task 9: E2E `setup-storage-google-drive.spec.ts`

- [ ] Mock the Google OAuth redirect to return a fake `code`, then mock the token endpoint at `oauth2.googleapis.com/token`. Assert that StorageCard ends up showing "Connected as test@example.com".
- [ ] Tag `@smoke` so it runs under `pnpm test:smoke`.

---

## Task 10: Verification Gate (manual smoke per §4.1)

The spec's literal verification-gate language: _"new tradie signs up → setup wizard StorageCard 'Connect Google Drive' → OAuth grant → return to `/setup` → Organization row has `storageProvider=GOOGLE_DRIVE` + encrypted refresh token."_

- [ ] **Step 1:** Deploy this PR to the sandbox env (`restoreassist-sandbox.vercel.app`).
- [ ] **Step 2:** Register a fresh test account with a never-before-used gmail.
- [ ] **Step 3:** Walk the flow: `/setup` → click "Google Drive" → consent → return to `/setup?storage=connected` → confirm "Connected as `<your-test-gmail>`" → confirm `useSetupStore().sections.storage === 'ready'`.
- [ ] **Step 4:** Verify the DB row in Supabase Studio:

  ```sql
  SELECT id, "storageProvider", "storageProviderAccountEmail",
         length("storageProviderRefreshToken") AS refresh_len,
         length("storageProviderAccessToken")  AS access_len,
         "storageProviderTokenExpiresAt",
         "storageProviderPkceVerifier"
  FROM "Organization"
  WHERE "ownerId" = '<test-user-id>';
  ```

  Expected: `storageProvider = 'GOOGLE_DRIVE'`, both `refresh_len` and `access_len` > 100, `storageProviderPkceVerifier IS NULL`, `storageProviderAccountEmail` matches the gmail.

- [ ] **Step 5:** Verify decryption round-trips (run a one-shot script on the sandbox host calling `decrypt(o.storageProviderRefreshToken)` — expected output starts with `1//`).
- [ ] **Step 6:** Replay-attack check (POST the same callback twice → second call returns `/setup?error=invalid-state`).
- [ ] **Step 7:** Regression check on a SUPABASE-only org (existing photo upload still works).
- [ ] **Step 8:** Capture evidence (screenshots + SQL output).
- [ ] **Step 9:** Open the PR titled `feat(setup): onboarding hotfix — Google Drive BYOK OAuth (SP-1 patch)`.
- [ ] **Step 10:** CI passes (`pnpm type-check`, `pnpm lint`, `pnpm vitest run`, `pnpm test:smoke:sandbox`, no Prisma migrate drift).

---

## Out of Scope (deferred to SP-E)

- Real `GoogleDriveStorageProvider` implementation
- Dual-write strategy (`StorageMirrorJob` Prisma model + queue)
- Close-package export hook (`exportClosedJobToBYOKStorage`)
- `/dashboard/settings/storage` page with mirror queue + last-sync timestamps
- OneDrive provider — card stays "Coming soon"
- `Organization.storageProvider = 'LOCAL'` persistence (UI selects it but no DB write; SP-E adds the route)
- Disconnect button on StorageCard — moved to settings page in SP-E
- Refresh-token rotation cron

## Risks & Mitigations

- **Risk:** Reusing `GOOGLE_CLIENT_ID` for both NextAuth Google sign-in and Drive scope flow may force users through Google's consent screen twice. **Mitigation:** Document the dedicated `GOOGLE_DRIVE_CLIENT_ID` path in `.env.example` and use a separate OAuth client in production.
- **Risk:** A user revokes Drive access in their Google account — our stored refresh token silently becomes invalid. **Out of scope** — SP-E adds the health-check.
- **Risk:** PKCE verifier persisted on `Organization` is racy if a user double-clicks "Connect Google Drive" in two tabs. **Mitigation:** The most-recent verifier always wins; older tab's callback fails token exchange and redirects to `/setup?error=token-exchange-failed`.

---

### Critical Files for Implementation

- `prisma/schema.prisma`
- `components/setup/StorageCard.tsx`
- `lib/integrations/oauth-handler.ts`
- `lib/credential-vault.ts`
- `lib/storage/index.ts`
