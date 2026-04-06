# App Store Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish RestoreAssist to Google Play Store (internal track → production) and Apple App Store using API-first automation via GitHub Actions CI/CD, with admin dashboard routes for status checking and release promotion.

**Architecture:** Android release uses googleapis npm with service account JSON to upload AAB directly from GitHub Actions. iOS release uses macOS runner + Fastlane gym (build) + Fastlane pilot (upload to TestFlight). Admin API routes in the app check release status. Store screenshots generated headlessly via Playwright.

**Tech Stack:** googleapis npm, GitHub Actions (ubuntu-latest for Android, macos-latest for iOS), Fastlane, Playwright, Next.js 15 App Router

---

## Prerequisites (USER ACTION REQUIRED before any task can be tested end-to-end)

The following accounts and credentials must be set up manually by the developer. These are outside the scope of code changes and cannot be automated.

### Google Play Store

1. Create a Google Play Developer account at https://play.google.com/console — $25 USD one-time fee
2. Create the app with package name `com.restoreassist.app` in the Play Console
3. Navigate to Setup → API access → Link to a Google Cloud project
4. In Google Cloud Console: create a Service Account, grant it "Release manager" role on the Play project, download the JSON key
5. Base64-encode the JSON key: `base64 -w 0 service-account.json` (Linux/macOS) or `[Convert]::ToBase64String([IO.File]::ReadAllBytes('service-account.json'))` (PowerShell)
6. Add to GitHub repo secrets: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (the raw JSON, not base64 — the `r0adkll/upload-google-play` action accepts plain JSON)
7. Complete the "internal testing" setup in Play Console: upload at least one AAB manually before the API can accept programmatic uploads
8. Add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` to GitHub secrets (these already exist for the build workflow — verify names match)

### Apple App Store

1. Enroll in Apple Developer Program at https://developer.apple.com — $149 AUD/year
2. Create the app in App Store Connect at https://appstoreconnect.apple.com with bundle ID `com.restoreassist.app`
3. Navigate to Users and Access → Keys → Generate an API key with "App Manager" role
4. Download the `.p8` file (can only be downloaded once), note the Key ID and Issuer ID
5. Base64-encode the `.p8` key: `base64 -w 0 AuthKey_XXXXXXXXXX.p8`
6. Create a Distribution certificate and provisioning profile in Xcode or developer.apple.com
7. Export the Distribution certificate as `.p12` (Keychain Access → export), set a password
8. Base64-encode both: `base64 -w 0 ios_distribution.p12` and `base64 -w 0 profile.mobileprovision`
9. Add all secrets to GitHub: `ASC_API_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_BASE64`, `APPLE_TEAM_ID`, `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`

---

## Task 1: Update `.env.example` and `.do/app.yaml`

**Scope:** Config files only — no functional code.

- [ ] **1.1** Read `D:/RestoreAssist/.env.example` to confirm the current end of the file.

- [ ] **1.2** Append the App Store publishing section to `.env.example`. Add after the `PORTAL_SECRET` entry at the end of the file:

  **File:** `D:/RestoreAssist/.env.example` — append at end:

  ```
  # ============================================
  # APP STORE PUBLISHING (Track 1 - Google Play / App Store)
  # ============================================

  # Google Play service account (JSON key for Android Publisher API)
  # Generate in Google Cloud Console → IAM → Service Accounts
  # Paste raw JSON (not base64) — the r0adkll/upload-google-play Action reads plain JSON
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=

  # App Store Connect API key (for iOS TestFlight + production submission)
  # Generate at: App Store Connect → Users and Access → Keys
  ASC_API_KEY_ID=                      # e.g. ABC123DEF4
  ASC_ISSUER_ID=                       # UUID format, e.g. 57246542-96fe-1a63-e053-0824d011012c
  ASC_PRIVATE_KEY_BASE64=              # Base64-encoded contents of the .p8 file

  # Apple Developer team ID (10-char alphanumeric, found in developer.apple.com/account)
  APPLE_TEAM_ID=                       # e.g. ABCDE12345
  ```

- [ ] **1.3** Read `D:/RestoreAssist/.do/app.yaml` to confirm the current end of the envs block.

- [ ] **1.4** Append three new env entries to `.do/app.yaml` inside the `envs:` list, following the existing SECRET/GENERAL pattern (after the `CRON_SECRET` entry):

  **File:** `D:/RestoreAssist/.do/app.yaml` — append to the `envs:` list:

  ```yaml
  - key: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
    scope: RUN_TIME
    type: SECRET
  - key: ASC_API_KEY_ID
    scope: RUN_TIME
    type: GENERAL
  - key: ASC_ISSUER_ID
    scope: RUN_TIME
    type: GENERAL
  ```

  Note: `ASC_PRIVATE_KEY_BASE64` and iOS signing certs are only consumed by GitHub Actions runners — they do not need to be in the app runtime and are not added to `app.yaml`.

- [ ] **1.5** Verify: Run `grep -n "GOOGLE_PLAY\|ASC_API\|ASC_ISSUER" D:/RestoreAssist/.env.example D:/RestoreAssist/.do/app.yaml` — expect 5 matching lines total (2 in .env.example header comments + 3 in .do/app.yaml).

- [ ] **1.6** Commit:
  ```
  git add .env.example .do/app.yaml
  git commit -m "chore(app-store): add publishing env vars to .env.example and .do/app.yaml"
  ```

---

## Task 2: `app/api/admin/publish/google-play/route.ts`

**Scope:** New API route — admin-only, no Prisma schema changes. Requires `googleapis` (already installed at ^166.0.0).

**NOTE: USER ACTION REQUIRED** — This route calls the real Google Play API. Unit tests use mocked googleapis. To test the live endpoint you must have completed the Google Play prerequisites above and set `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` in your `.env.local`.

- [ ] **2.1** Create the directory if it does not exist:

  ```bash
  mkdir -p D:/RestoreAssist/app/api/admin/publish/google-play
  ```

- [ ] **2.2** Write the route file.

  **File:** `D:/RestoreAssist/app/api/admin/publish/google-play/route.ts`

  ```typescript
  import { NextRequest, NextResponse } from "next/server";
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";
  import { google } from "googleapis";

  function getAndroidPublisher() {
    const json = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    if (!json)
      throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured");
    const credentials = JSON.parse(json) as object;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
    return google.androidpublisher({ version: "v3", auth });
  }

  const PACKAGE_NAME = "com.restoreassist.app";

  // GET — check current release status for a given track
  // Query params: ?track=internal|alpha|beta|production (default: internal)
  export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const track = searchParams.get("track") ?? "internal";

    try {
      const publisher = getAndroidPublisher();

      // Open a transient edit to read track state
      const editRes = await publisher.edits.insert({
        packageName: PACKAGE_NAME,
      });
      const editId = editRes.data.id!;

      const trackRes = await publisher.edits.tracks.get({
        packageName: PACKAGE_NAME,
        editId,
        track,
      });

      // Delete the transient edit — we only needed it for a read
      await publisher.edits.delete({ packageName: PACKAGE_NAME, editId });

      return NextResponse.json({
        data: {
          track,
          releases: trackRes.data.releases ?? [],
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Google Play API error: ${message}` },
        { status: 500 },
      );
    }
  }

  // POST — promote a release from one track to a higher track
  // Body: { fromTrack?: string; toTrack?: string; versionCodes?: number[] }
  // Defaults: fromTrack="internal", toTrack="alpha"
  // If versionCodes is omitted, promotes the first release found on fromTrack
  export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      fromTrack?: string;
      toTrack?: string;
      versionCodes?: number[];
    };
    const fromTrack = body.fromTrack ?? "internal";
    const toTrack = body.toTrack ?? "alpha";
    const versionCodes = body.versionCodes;

    try {
      const publisher = getAndroidPublisher();

      // Create a new edit to perform the promotion
      const editRes = await publisher.edits.insert({
        packageName: PACKAGE_NAME,
      });
      const editId = editRes.data.id!;

      // Read releases from source track
      const sourceTrackRes = await publisher.edits.tracks.get({
        packageName: PACKAGE_NAME,
        editId,
        track: fromTrack,
      });

      const releases = sourceTrackRes.data.releases ?? [];

      const releaseToPromote = versionCodes
        ? releases.find((r) =>
            r.versionCodes?.some((vc) => versionCodes.includes(Number(vc))),
          )
        : releases[0];

      if (!releaseToPromote) {
        await publisher.edits.delete({ packageName: PACKAGE_NAME, editId });
        return NextResponse.json(
          {
            error: `No release found on track "${fromTrack}" matching the request`,
          },
          { status: 404 },
        );
      }

      // Write the release onto the destination track
      await publisher.edits.tracks.update({
        packageName: PACKAGE_NAME,
        editId,
        track: toTrack,
        requestBody: {
          track: toTrack,
          releases: [{ ...releaseToPromote, status: "completed" }],
        },
      });

      // Commit — this makes the change visible in Play Console
      const commitRes = await publisher.edits.commit({
        packageName: PACKAGE_NAME,
        editId,
      });

      return NextResponse.json({
        data: {
          editId: commitRes.data.id,
          fromTrack,
          toTrack,
          promotedReleaseName: releaseToPromote.name ?? "(unnamed)",
          promotedVersionCodes: releaseToPromote.versionCodes,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Google Play promotion failed: ${message}` },
        { status: 500 },
      );
    }
  }
  ```

- [ ] **2.3** Create the test directory and write unit tests.

  **File:** `D:/RestoreAssist/app/api/admin/publish/google-play/__tests__/route.test.ts`

  ```typescript
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { GET, POST } from "../route";
  import { NextRequest } from "next/server";

  // --- Mocks ---

  vi.mock("next-auth", () => ({
    getServerSession: vi.fn(),
  }));

  vi.mock("@/lib/auth", () => ({ authOptions: {} }));

  const mockEditsInsert = vi.fn();
  const mockTracksGet = vi.fn();
  const mockTracksUpdate = vi.fn();
  const mockEditsDelete = vi.fn();
  const mockEditsCommit = vi.fn();

  vi.mock("googleapis", () => ({
    google: {
      auth: {
        GoogleAuth: vi.fn().mockImplementation(() => ({})),
      },
      androidpublisher: vi.fn().mockReturnValue({
        edits: {
          insert: mockEditsInsert,
          delete: mockEditsDelete,
          commit: mockEditsCommit,
          tracks: {
            get: mockTracksGet,
            update: mockTracksUpdate,
          },
        },
      }),
    },
  }));

  import { getServerSession } from "next-auth";

  const adminSession = { user: { id: "u1", role: "ADMIN" } };
  const userSession = { user: { id: "u2", role: "USER" } };

  function makeRequest(url: string, options?: RequestInit): NextRequest {
    return new NextRequest(url, options);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({
      type: "service_account",
      project_id: "test",
      client_email: "test@test.iam.gserviceaccount.com",
      private_key: "fake",
    });
  });

  // --- GET tests ---

  describe("GET /api/admin/publish/google-play", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      const req = makeRequest("http://localhost/api/admin/publish/google-play");
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 403 when authenticated but not ADMIN", async () => {
      vi.mocked(getServerSession).mockResolvedValue(userSession);
      const req = makeRequest("http://localhost/api/admin/publish/google-play");
      const res = await GET(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns track release data for ADMIN", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      mockEditsInsert.mockResolvedValue({ data: { id: "edit-123" } });
      mockTracksGet.mockResolvedValue({
        data: {
          releases: [
            { name: "v1.0.0", versionCodes: ["1"], status: "completed" },
          ],
        },
      });
      mockEditsDelete.mockResolvedValue({});

      const req = makeRequest(
        "http://localhost/api/admin/publish/google-play?track=internal",
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.track).toBe("internal");
      expect(body.data.releases).toHaveLength(1);
      expect(body.data.releases[0].name).toBe("v1.0.0");
    });

    it("returns empty releases array when track has no releases", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      mockEditsInsert.mockResolvedValue({ data: { id: "edit-456" } });
      mockTracksGet.mockResolvedValue({ data: {} }); // no releases key
      mockEditsDelete.mockResolvedValue({});

      const req = makeRequest("http://localhost/api/admin/publish/google-play");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.releases).toEqual([]);
    });

    it("defaults track to 'internal' when no query param", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      mockEditsInsert.mockResolvedValue({ data: { id: "edit-789" } });
      mockTracksGet.mockResolvedValue({ data: { releases: [] } });
      mockEditsDelete.mockResolvedValue({});

      const req = makeRequest("http://localhost/api/admin/publish/google-play");
      await GET(req);

      expect(mockTracksGet).toHaveBeenCalledWith(
        expect.objectContaining({ track: "internal" }),
      );
    });
  });

  // --- POST tests ---

  describe("POST /api/admin/publish/google-play", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      const req = makeRequest(
        "http://localhost/api/admin/publish/google-play",
        {
          method: "POST",
          body: JSON.stringify({ fromTrack: "internal", toTrack: "alpha" }),
        },
      );
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when authenticated but not ADMIN", async () => {
      vi.mocked(getServerSession).mockResolvedValue(userSession);
      const req = makeRequest(
        "http://localhost/api/admin/publish/google-play",
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("returns 404 when no release found on fromTrack", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      mockEditsInsert.mockResolvedValue({ data: { id: "edit-001" } });
      mockTracksGet.mockResolvedValue({ data: { releases: [] } });
      mockEditsDelete.mockResolvedValue({});

      const req = makeRequest(
        "http://localhost/api/admin/publish/google-play",
        {
          method: "POST",
          body: JSON.stringify({ fromTrack: "internal", toTrack: "alpha" }),
        },
      );
      const res = await POST(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("No release found");
    });

    it("promotes release and commits edit for ADMIN", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      mockEditsInsert.mockResolvedValue({ data: { id: "edit-002" } });
      mockTracksGet.mockResolvedValue({
        data: {
          releases: [
            { name: "1.2.0", versionCodes: ["5"], status: "completed" },
          ],
        },
      });
      mockTracksUpdate.mockResolvedValue({});
      mockEditsCommit.mockResolvedValue({ data: { id: "edit-002" } });

      const req = makeRequest(
        "http://localhost/api/admin/publish/google-play",
        {
          method: "POST",
          body: JSON.stringify({ fromTrack: "internal", toTrack: "alpha" }),
        },
      );
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.fromTrack).toBe("internal");
      expect(body.data.toTrack).toBe("alpha");
      expect(body.data.promotedReleaseName).toBe("1.2.0");
      expect(mockEditsCommit).toHaveBeenCalledOnce();
    });

    it("promotes specific versionCodes when provided", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      mockEditsInsert.mockResolvedValue({ data: { id: "edit-003" } });
      mockTracksGet.mockResolvedValue({
        data: {
          releases: [
            { name: "old", versionCodes: ["3"], status: "completed" },
            { name: "target", versionCodes: ["7"], status: "completed" },
          ],
        },
      });
      mockTracksUpdate.mockResolvedValue({});
      mockEditsCommit.mockResolvedValue({ data: { id: "edit-003" } });

      const req = makeRequest(
        "http://localhost/api/admin/publish/google-play",
        {
          method: "POST",
          body: JSON.stringify({
            fromTrack: "internal",
            toTrack: "production",
            versionCodes: [7],
          }),
        },
      );
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.promotedReleaseName).toBe("target");
    });
  });
  ```

- [ ] **2.4** Run the tests:

  ```bash
  npx vitest run D:/RestoreAssist/app/api/admin/publish/google-play/__tests__/route.test.ts
  ```

  Expected output: `✓ 9 tests passed`

- [ ] **2.5** Run type-check on the new file:

  ```bash
  npx tsc --noEmit D:/RestoreAssist/app/api/admin/publish/google-play/route.ts
  ```

  Expected output: no errors.

- [ ] **2.6** Commit:
  ```bash
  git add app/api/admin/publish/google-play/
  git commit -m "feat(admin): Google Play status-check and track promotion API route"
  ```

---

## Task 3: `app/api/admin/publish/app-store/route.ts`

**Scope:** New API route — admin-only, uses App Store Connect REST API via JWT. Requires `jose` package (NOT currently in package.json).

**NOTE: USER ACTION REQUIRED** — Live calls require completed Apple Developer prerequisites above and `ASC_API_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_BASE64` in `.env.local`.

- [ ] **3.1** Install the `jose` package (ES module JWT library — smaller than jsonwebtoken, works in Edge Runtime):

  ```bash
  cd D:/RestoreAssist && pnpm add jose
  ```

  Expected output: `+ jose X.X.X` in the pnpm output. Verify: `grep '"jose"' package.json` returns a version string.

- [ ] **3.2** Create the directory:

  ```bash
  mkdir -p D:/RestoreAssist/app/api/admin/publish/app-store
  ```

- [ ] **3.3** Write the route file.

  **File:** `D:/RestoreAssist/app/api/admin/publish/app-store/route.ts`

  ```typescript
  import { NextRequest, NextResponse } from "next/server";
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";
  import * as jose from "jose";

  /**
   * Mint a short-lived JWT for the App Store Connect API.
   * The .p8 private key is stored base64-encoded in ASC_PRIVATE_KEY_BASE64.
   * Token lifetime is 20 minutes (ASC maximum is 20 minutes).
   *
   * References:
   *  - https://developer.apple.com/documentation/appstoreconnectapi/generating_tokens_for_api_requests
   */
  async function getAscToken(): Promise<string> {
    const keyId = process.env.ASC_API_KEY_ID;
    const issuerId = process.env.ASC_ISSUER_ID;
    const privateKeyB64 = process.env.ASC_PRIVATE_KEY_BASE64;

    if (!keyId || !issuerId || !privateKeyB64) {
      throw new Error(
        "ASC_API_KEY_ID, ASC_ISSUER_ID, and ASC_PRIVATE_KEY_BASE64 must all be set",
      );
    }

    const privateKeyPem = Buffer.from(privateKeyB64, "base64").toString(
      "utf-8",
    );
    const privateKey = await jose.importPKCS8(privateKeyPem, "ES256");

    return new jose.SignJWT({ iss: issuerId, aud: "appstoreconnect-v1" })
      .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("20m")
      .sign(privateKey);
  }

  const ASC_BASE = "https://api.appstoreconnect.apple.com/v1";
  const BUNDLE_ID = "com.restoreassist.app";

  /**
   * GET /api/admin/publish/app-store
   *
   * Returns the 5 most recent TestFlight builds for the RestoreAssist iOS app.
   * Response shape:
   *   { data: { appId, appName, builds: BuildResource[] } }
   *
   * ADMIN-only.
   */
  export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
      const token = await getAscToken();

      // Step 1: resolve the App ID from bundle ID
      const appsRes = await fetch(
        `${ASC_BASE}/apps?filter[bundleId]=${BUNDLE_ID}&fields[apps]=name,bundleId`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!appsRes.ok) {
        const text = await appsRes.text();
        return NextResponse.json(
          { error: `ASC /apps error ${appsRes.status}: ${text}` },
          { status: appsRes.status },
        );
      }

      const appsData = (await appsRes.json()) as {
        data: Array<{
          id: string;
          attributes: { name: string; bundleId: string };
        }>;
      };

      const app = appsData.data[0];
      if (!app) {
        return NextResponse.json(
          {
            error: `No app found in App Store Connect with bundle ID "${BUNDLE_ID}"`,
          },
          { status: 404 },
        );
      }

      // Step 2: fetch recent builds
      const buildsRes = await fetch(
        `${ASC_BASE}/builds` +
          `?filter[app]=${app.id}` +
          `&sort=-uploadedDate` +
          `&limit=5` +
          `&fields[builds]=version,uploadedDate,processingState,betaAppReviewSubmission`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!buildsRes.ok) {
        const text = await buildsRes.text();
        return NextResponse.json(
          { error: `ASC /builds error ${buildsRes.status}: ${text}` },
          { status: buildsRes.status },
        );
      }

      const buildsData = (await buildsRes.json()) as { data: unknown[] };

      return NextResponse.json({
        data: {
          appId: app.id,
          appName: app.attributes.name,
          builds: buildsData.data,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `App Store Connect error: ${message}` },
        { status: 500 },
      );
    }
  }
  ```

- [ ] **3.4** Create the test directory and write unit tests.

  **File:** `D:/RestoreAssist/app/api/admin/publish/app-store/__tests__/route.test.ts`

  ```typescript
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { GET } from "../route";
  import { NextRequest } from "next/server";

  // --- Mocks ---

  vi.mock("next-auth", () => ({
    getServerSession: vi.fn(),
  }));

  vi.mock("@/lib/auth", () => ({ authOptions: {} }));

  // Mock jose so we don't need a real EC key
  vi.mock("jose", () => ({
    importPKCS8: vi.fn().mockResolvedValue({ type: "fake-key" }),
    SignJWT: vi.fn().mockImplementation(() => ({
      setProtectedHeader: vi.fn().mockReturnThis(),
      setIssuedAt: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue("mock-jwt-token"),
    })),
  }));

  import { getServerSession } from "next-auth";

  const adminSession = { user: { id: "u1", role: "ADMIN" } };
  const userSession = { user: { id: "u2", role: "USER" } };

  function makeRequest(url: string): NextRequest {
    return new NextRequest(url);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env vars
    process.env.ASC_API_KEY_ID = "TESTKEY123";
    process.env.ASC_ISSUER_ID = "57246542-96fe-1a63-e053-0824d011012c";
    process.env.ASC_PRIVATE_KEY_BASE64 = Buffer.from(
      "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
    ).toString("base64");

    // Reset global fetch mock between tests
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("GET /api/admin/publish/app-store", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      const req = makeRequest("http://localhost/api/admin/publish/app-store");
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 403 when authenticated but not ADMIN", async () => {
      vi.mocked(getServerSession).mockResolvedValue(userSession);
      const req = makeRequest("http://localhost/api/admin/publish/app-store");
      const res = await GET(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 500 when ASC env vars are missing", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      delete process.env.ASC_API_KEY_ID;

      const req = makeRequest("http://localhost/api/admin/publish/app-store");
      const res = await GET(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("ASC_API_KEY_ID");
    });

    it("returns 404 when bundle ID not found in App Store Connect", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      const req = makeRequest("http://localhost/api/admin/publish/app-store");
      const res = await GET(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("No app found");
    });

    it("forwards ASC API errors with the original status code", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "FORBIDDEN",
      } as Response);

      const req = makeRequest("http://localhost/api/admin/publish/app-store");
      const res = await GET(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("FORBIDDEN");
    });

    it("returns appId, appName, and builds list for ADMIN", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);

      // First fetch: /apps
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              {
                id: "app-abc123",
                attributes: {
                  name: "RestoreAssist",
                  bundleId: "com.restoreassist.app",
                },
              },
            ],
          }),
        } as Response)
        // Second fetch: /builds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              {
                id: "build-1",
                attributes: {
                  version: "1.2.0",
                  uploadedDate: "2026-04-01T00:00:00Z",
                  processingState: "VALID",
                },
              },
            ],
          }),
        } as Response);

      const req = makeRequest("http://localhost/api/admin/publish/app-store");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.appId).toBe("app-abc123");
      expect(body.data.appName).toBe("RestoreAssist");
      expect(body.data.builds).toHaveLength(1);
      expect(body.data.builds[0].attributes.version).toBe("1.2.0");
    });
  });
  ```

- [ ] **3.5** Run the tests:

  ```bash
  npx vitest run D:/RestoreAssist/app/api/admin/publish/app-store/__tests__/route.test.ts
  ```

  Expected output: `✓ 6 tests passed`

- [ ] **3.6** Run type-check:

  ```bash
  npx tsc --noEmit D:/RestoreAssist/app/api/admin/publish/app-store/route.ts
  ```

  Expected output: no errors.

- [ ] **3.7** Commit:
  ```bash
  git add app/api/admin/publish/app-store/ pnpm-lock.yaml package.json
  git commit -m "feat(admin): App Store Connect build status API route + jose dependency"
  ```

---

## Task 4: `scripts/generate-store-assets.ts`

**Scope:** New standalone script. Playwright is already installed. Generates store-required screenshot dimensions headlessly.

**NOTE: USER ACTION REQUIRED** — This script needs `pnpm dev` running in a separate terminal so the local Next.js server is reachable at `http://localhost:3000`. The screenshot pages (`/dashboard`, `/dashboard/reports`, `/dashboard/clients`) require an active authenticated session; for CI use a seeded test account or a preview deployment URL via `STORE_ASSET_BASE_URL`.

- [ ] **4.1** Write the script file.

  **File:** `D:/RestoreAssist/scripts/generate-store-assets.ts`

  ```typescript
  #!/usr/bin/env tsx
  /**
   * generate-store-assets.ts
   *
   * Headlessly captures screenshots at the exact pixel dimensions required by
   * Google Play Store and Apple App Store.
   *
   * Usage:
   *   pnpm dev &                      # Start dev server in background
   *   npx tsx scripts/generate-store-assets.ts
   *
   * Output directory: <project-root>/store-assets/
   *   store-assets/google-play/phone/dashboard.png
   *   store-assets/google-play/phone/reports-list.png
   *   store-assets/google-play/phone/clients-list.png
   *   store-assets/google-play/tablet-7in/...
   *   store-assets/app-store/iphone-15-pro-max/...
   *   store-assets/app-store/ipad-pro-12-9/...
   *
   * Environment:
   *   STORE_ASSET_BASE_URL  Base URL of a running Next.js instance.
   *                         Defaults to http://localhost:3000
   *
   * Google Play required dimensions (2 minimum, 8 maximum):
   *   Phone: 1080×1920 px (portrait)
   *   7-inch tablet: 1200×1920 px
   *
   * App Store required dimensions:
   *   iPhone 15 Pro Max (6.7-inch): 1290×2796 px
   *   iPad Pro 12.9-inch (6th gen): 2048×2732 px
   */

  import { chromium } from "playwright";
  import { mkdirSync } from "fs";
  import path from "path";

  const BASE_URL = process.env.STORE_ASSET_BASE_URL ?? "http://localhost:3000";

  /** Pages to screenshot. Each produces one PNG per dimension. */
  const SCREENS: Array<{ path: string; name: string; waitSelector?: string }> =
    [
      {
        path: "/dashboard",
        name: "dashboard",
        waitSelector: '[data-testid="dashboard-content"], main',
      },
      {
        path: "/dashboard/reports",
        name: "reports-list",
        waitSelector: '[data-testid="reports-list"], main',
      },
      {
        path: "/dashboard/clients",
        name: "clients-list",
        waitSelector: '[data-testid="clients-list"], main',
      },
    ];

  /** Target dimensions per store. Labels become directory names. */
  const DIMENSIONS = {
    "google-play": [
      { width: 1080, height: 1920, label: "phone" },
      { width: 1200, height: 1920, label: "tablet-7in" },
    ],
    "app-store": [
      { width: 1290, height: 2796, label: "iphone-15-pro-max" },
      { width: 2048, height: 2732, label: "ipad-pro-12-9" },
    ],
  } as const;

  type Store = keyof typeof DIMENSIONS;

  async function main(): Promise<void> {
    const outputDir = path.join(process.cwd(), "store-assets");

    // Pre-create all output directories
    for (const store of Object.keys(DIMENSIONS) as Store[]) {
      for (const dim of DIMENSIONS[store]) {
        mkdirSync(path.join(outputDir, store, dim.label), { recursive: true });
      }
    }

    console.log(`[assets] Base URL: ${BASE_URL}`);
    console.log(
      `[assets] Capturing ${SCREENS.length} screens × ${Object.values(DIMENSIONS).flat().length} dimensions`,
    );

    const browser = await chromium.launch({ headless: true });

    let captureCount = 0;

    for (const screen of SCREENS) {
      for (const store of Object.keys(DIMENSIONS) as Store[]) {
        for (const dim of DIMENSIONS[store]) {
          const context = await browser.newContext({
            viewport: { width: dim.width, height: dim.height },
            deviceScaleFactor: 1,
            // Disable animations for consistent screenshots
            reducedMotion: "reduce",
          });

          const page = await context.newPage();

          try {
            await page.goto(`${BASE_URL}${screen.path}`, {
              waitUntil: "networkidle",
              timeout: 30_000,
            });

            // Wait for primary content selector if provided, fall back to 2s
            if (screen.waitSelector) {
              await page
                .locator(screen.waitSelector)
                .first()
                .waitFor({ timeout: 10_000 })
                .catch(() => {
                  // Non-fatal — page may have redirected to login
                  console.warn(
                    `[assets] Warning: selector "${screen.waitSelector}" not found on ${screen.path}`,
                  );
                });
            }

            const outputPath = path.join(
              outputDir,
              store,
              dim.label,
              `${screen.name}.png`,
            );

            await page.screenshot({ path: outputPath, fullPage: false });
            console.log(`[assets] ✓ ${outputPath}`);
            captureCount++;
          } catch (err) {
            console.error(
              `[assets] ✗ Failed ${screen.path} at ${dim.width}×${dim.height}: ${err}`,
            );
          } finally {
            await context.close();
          }
        }
      }
    }

    await browser.close();
    console.log(
      `[assets] Done. ${captureCount} screenshots saved to store-assets/`,
    );
  }

  main().catch((err) => {
    console.error("[assets] Fatal error:", err);
    process.exit(1);
  });
  ```

- [ ] **4.2** Verify the script type-checks cleanly:

  ```bash
  npx tsc --noEmit D:/RestoreAssist/scripts/generate-store-assets.ts
  ```

  Expected output: no errors (or only path alias warnings — the script uses only Node/Playwright imports).

- [ ] **4.3** Run a dry-run smoke test against the local dev server (requires `pnpm dev` running in a separate terminal first):

  ```bash
  cd D:/RestoreAssist && npx tsx scripts/generate-store-assets.ts
  ```

  Expected output:

  ```
  [assets] Base URL: http://localhost:3000
  [assets] Capturing 3 screens × 4 dimensions
  [assets] ✓ store-assets/google-play/phone/dashboard.png
  ...
  [assets] Done. 12 screenshots saved to store-assets/
  ```

  Expected files: 12 PNG files spread across `store-assets/google-play/{phone,tablet-7in}/` and `store-assets/app-store/{iphone-15-pro-max,ipad-pro-12-9}/`.

  Note: If pages redirect to `/login` (no active session), screenshots will show the login page. This is acceptable for a first-run smoke test; the actual store submission screenshots should be taken against a preview deployment with a seeded test session.

- [ ] **4.4** Add `store-assets/` to `.gitignore` (binary PNG files should not be committed):

  ```bash
  echo "store-assets/" >> D:/RestoreAssist/.gitignore
  ```

  Verify: `grep "store-assets" D:/RestoreAssist/.gitignore` returns the line.

- [ ] **4.5** Commit:
  ```bash
  git add scripts/generate-store-assets.ts .gitignore
  git commit -m "feat(scripts): headless Playwright store screenshot generator"
  ```

---

## Task 5: `app/api/admin/publish/assets/route.ts`

**Scope:** New API route — admin-only. Lists generated store asset files and triggers the screenshot script.

**Note:** The `POST` handler runs `npx tsx scripts/generate-store-assets.ts` synchronously via `execSync`. This is intentional for an admin-triggered, infrequent operation. The 120-second timeout matches the expected Playwright run time. This route is NOT suitable for production serverless environments (Vercel/Digital Ocean App Platform serverless functions have a 60s timeout). Deploy on a persistent Node.js server (Digital Ocean Droplet / self-hosted) or use the script directly in CI.

- [ ] **5.1** Create the directory:

  ```bash
  mkdir -p D:/RestoreAssist/app/api/admin/publish/assets
  ```

- [ ] **5.2** Write the route file.

  **File:** `D:/RestoreAssist/app/api/admin/publish/assets/route.ts`

  ```typescript
  import { NextRequest, NextResponse } from "next/server";
  import { getServerSession } from "next-auth";
  import { authOptions } from "@/lib/auth";
  import { execSync } from "child_process";
  import { readdirSync, existsSync, statSync } from "fs";
  import path from "path";

  const STORES = ["google-play", "app-store"] as const;

  interface AssetEntry {
    relativePath: string;
    store: string;
    dimension: string;
    filename: string;
    sizeBytes: number;
  }

  function listAssets(): AssetEntry[] {
    const assetsDir = path.join(process.cwd(), "store-assets");
    if (!existsSync(assetsDir)) return [];

    const entries: AssetEntry[] = [];

    for (const store of STORES) {
      const storeDir = path.join(assetsDir, store);
      if (!existsSync(storeDir)) continue;

      for (const dim of readdirSync(storeDir)) {
        const dimDir = path.join(storeDir, dim);
        if (!statSync(dimDir).isDirectory()) continue;

        for (const file of readdirSync(dimDir)) {
          const fullPath = path.join(dimDir, file);
          const stat = statSync(fullPath);
          entries.push({
            relativePath: `store-assets/${store}/${dim}/${file}`,
            store,
            dimension: dim,
            filename: file,
            sizeBytes: stat.size,
          });
        }
      }
    }

    return entries;
  }

  /**
   * GET /api/admin/publish/assets
   *
   * Lists all generated store asset screenshots.
   * Returns { data: { files: AssetEntry[], generated: boolean, totalCount: number } }
   *
   * ADMIN-only.
   */
  export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const files = listAssets();

    return NextResponse.json({
      data: {
        files,
        generated: files.length > 0,
        totalCount: files.length,
      },
    });
  }

  /**
   * POST /api/admin/publish/assets
   *
   * Triggers the store screenshot generation script synchronously.
   * Body: { baseUrl?: string }  — optional override for STORE_ASSET_BASE_URL
   *
   * WARNING: Runs a Playwright browser process for ~30–120s.
   * Only call this from an admin UI, not from automated pipelines.
   *
   * ADMIN-only.
   */
  export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      baseUrl?: string;
    };

    const baseUrl = body.baseUrl ?? "http://localhost:3000";

    try {
      execSync("npx tsx scripts/generate-store-assets.ts", {
        timeout: 120_000,
        cwd: process.cwd(),
        env: {
          ...process.env,
          STORE_ASSET_BASE_URL: baseUrl,
        },
        stdio: "pipe", // Suppress stdout/stderr from the child process
      });

      const files = listAssets();

      return NextResponse.json({
        data: {
          status: "generated",
          files,
          totalCount: files.length,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Asset generation failed: ${message}` },
        { status: 500 },
      );
    }
  }
  ```

- [ ] **5.3** Create the test directory and write unit tests.

  **File:** `D:/RestoreAssist/app/api/admin/publish/assets/__tests__/route.test.ts`

  ```typescript
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { GET, POST } from "../route";
  import { NextRequest } from "next/server";

  // --- Mocks ---

  vi.mock("next-auth", () => ({
    getServerSession: vi.fn(),
  }));

  vi.mock("@/lib/auth", () => ({ authOptions: {} }));

  // Mock fs functions
  const mockExistsSync = vi.fn();
  const mockReaddirSync = vi.fn();
  const mockStatSync = vi.fn();

  vi.mock("fs", () => ({
    existsSync: (p: string) => mockExistsSync(p),
    readdirSync: (p: string) => mockReaddirSync(p),
    statSync: (p: string) => mockStatSync(p),
  }));

  // Mock child_process
  const mockExecSync = vi.fn();
  vi.mock("child_process", () => ({
    execSync: (...args: unknown[]) => mockExecSync(...args),
  }));

  import { getServerSession } from "next-auth";

  const adminSession = { user: { id: "u1", role: "ADMIN" } };
  const userSession = { user: { id: "u2", role: "USER" } };

  function makeRequest(url: string, options?: RequestInit): NextRequest {
    return new NextRequest(url, options);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- GET tests ---

  describe("GET /api/admin/publish/assets", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      const req = makeRequest("http://localhost/api/admin/publish/assets");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-ADMIN", async () => {
      vi.mocked(getServerSession).mockResolvedValue(userSession);
      const req = makeRequest("http://localhost/api/admin/publish/assets");
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it("returns generated=false when store-assets directory does not exist", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      mockExistsSync.mockReturnValue(false);

      const req = makeRequest("http://localhost/api/admin/publish/assets");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.generated).toBe(false);
      expect(body.data.totalCount).toBe(0);
      expect(body.data.files).toEqual([]);
    });

    it("returns file list when assets exist", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      // Root store-assets dir exists
      mockExistsSync.mockImplementation((p: string) => true);
      // readdirSync returns dimension dirs for each store, then files within
      mockReaddirSync.mockImplementation((p: string) => {
        if (p.endsWith("google-play")) return ["phone"];
        if (p.endsWith("app-store")) return ["iphone-15-pro-max"];
        if (p.endsWith("phone")) return ["dashboard.png"];
        if (p.endsWith("iphone-15-pro-max")) return ["dashboard.png"];
        return [];
      });
      mockStatSync.mockImplementation((p: string) => ({
        isDirectory: () => !p.endsWith(".png"),
        size: 204800,
      }));

      const req = makeRequest("http://localhost/api/admin/publish/assets");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.generated).toBe(true);
      expect(body.data.totalCount).toBe(2);
      expect(body.data.files[0].store).toBe("google-play");
      expect(body.data.files[0].dimension).toBe("phone");
      expect(body.data.files[0].filename).toBe("dashboard.png");
    });
  });

  // --- POST tests ---

  describe("POST /api/admin/publish/assets", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      const req = makeRequest("http://localhost/api/admin/publish/assets", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-ADMIN", async () => {
      vi.mocked(getServerSession).mockResolvedValue(userSession);
      const req = makeRequest("http://localhost/api/admin/publish/assets", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("runs script and returns generated status on success", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      mockExecSync.mockReturnValue(undefined); // success
      mockExistsSync.mockReturnValue(false); // no files yet (script didn't actually run)

      const req = makeRequest("http://localhost/api/admin/publish/assets", {
        method: "POST",
        body: JSON.stringify({ baseUrl: "http://localhost:3000" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("generated");
      expect(mockExecSync).toHaveBeenCalledWith(
        "npx tsx scripts/generate-store-assets.ts",
        expect.objectContaining({
          timeout: 120_000,
          env: expect.objectContaining({
            STORE_ASSET_BASE_URL: "http://localhost:3000",
          }),
        }),
      );
    });

    it("returns 500 when script throws", async () => {
      vi.mocked(getServerSession).mockResolvedValue(adminSession);
      mockExecSync.mockImplementation(() => {
        throw new Error("Playwright browser not found");
      });

      const req = makeRequest("http://localhost/api/admin/publish/assets", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Asset generation failed");
      expect(body.error).toContain("Playwright browser not found");
    });
  });
  ```

- [ ] **5.4** Run the tests:

  ```bash
  npx vitest run D:/RestoreAssist/app/api/admin/publish/assets/__tests__/route.test.ts
  ```

  Expected output: `✓ 8 tests passed`

- [ ] **5.5** Run type-check:

  ```bash
  npx tsc --noEmit D:/RestoreAssist/app/api/admin/publish/assets/route.ts
  ```

  Expected output: no errors.

- [ ] **5.6** Commit:
  ```bash
  git add app/api/admin/publish/assets/
  git commit -m "feat(admin): store asset listing and generation trigger API route"
  ```

---

## Task 6: `.github/workflows/android-release.yml`

**Scope:** New GitHub Actions workflow. Extends the existing `android-build-field-app.yml` pattern with the Google Play upload step uncommented and promoted to its own dedicated release workflow. Uses `pnpm` (consistent with existing workflow), Java 21, and the `r0adkll/upload-google-play@v1` action.

**NOTE: USER ACTION REQUIRED** — This workflow will not run until all GitHub secrets listed in the Prerequisites section are set. The Play Console must also have received at least one manually uploaded AAB before the API accepts programmatic uploads.

- [ ] **6.1** Create the whatsnew directory and release notes file:

  ```bash
  mkdir -p D:/RestoreAssist/distribution/whatsnew
  ```

  **File:** `D:/RestoreAssist/distribution/whatsnew/whatsnew-en-AU`

  ```
  Bug fixes and performance improvements.
  ```

- [ ] **6.2** Write the workflow file.

  **File:** `D:/RestoreAssist/.github/workflows/android-release.yml`

  ```yaml
  # Android Release — Google Play
  #
  # Triggered by tags matching "android-v*" (e.g. android-v1.2.0).
  # Builds a signed AAB and uploads it to Google Play internal testing track.
  # Promote to alpha/beta/production from the admin dashboard or Play Console.
  #
  # Required GitHub Actions secrets:
  #   ANDROID_KEYSTORE_BASE64       Base64-encoded .jks keystore file
  #   ANDROID_KEY_STORE_PASSWORD    Keystore password
  #   ANDROID_KEY_ALIAS             Key alias within the keystore
  #   ANDROID_KEY_PASSWORD          Key password (usually same as store password)
  #   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON   Service account JSON (plain, not base64)
  #
  # This workflow uses the same secret names as android-build-field-app.yml.
  # The Play upload step requires Google Play prerequisites to be complete
  # (see docs/superpowers/plans/2026-04-06-app-store-setup-plan.md).

  name: Android Release — Google Play

  on:
    push:
      tags:
        - "android-v*" # e.g. android-v1.2.0
    workflow_dispatch: # Allow manual trigger from GitHub Actions UI

  jobs:
    build-and-publish:
      name: Build Signed AAB and Upload to Play
      runs-on: ubuntu-latest

      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Install pnpm
          uses: pnpm/action-setup@v4
          with:
            version: 9

        - name: Set up Node.js
          uses: actions/setup-node@v4
          with:
            node-version: "22"
            cache: "pnpm"

        - name: Install dependencies
          run: pnpm install --no-frozen-lockfile

        - name: Set up Java
          uses: actions/setup-java@v4
          with:
            java-version: "21"
            distribution: "temurin"

        # RestoreAssist uses a server-hosted Capacitor WebView.
        # No Next.js static export is needed — the app loads https://restoreassist.com.au.
        # cap sync copies native plugin changes into the Android project.
        - name: Sync Capacitor Android
          run: |
            mkdir -p android/app/src/main/assets/public
            npx cap sync android

        - name: Decode keystore
          run: |
            echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode \
              > android/app/restoreassist-release.jks

        - name: Build signed AAB
          working-directory: android
          run: |
            ./gradlew bundleRelease \
              -Pandroid.injected.signing.store.file=$GITHUB_WORKSPACE/android/app/restoreassist-release.jks \
              -Pandroid.injected.signing.store.password="${{ secrets.ANDROID_KEY_STORE_PASSWORD }}" \
              -Pandroid.injected.signing.key.alias="${{ secrets.ANDROID_KEY_ALIAS }}" \
              -Pandroid.injected.signing.key.password="${{ secrets.ANDROID_KEY_PASSWORD }}"

        - name: Upload AAB artifact (for debugging)
          uses: actions/upload-artifact@v4
          with:
            name: restoreassist-release-${{ github.ref_name }}
            path: android/app/build/outputs/bundle/release/app-release.aab
            retention-days: 14

        - name: Upload to Google Play (internal track)
          uses: r0adkll/upload-google-play@v1
          with:
            serviceAccountJsonPlainText: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}
            packageName: com.restoreassist.app
            releaseFiles: android/app/build/outputs/bundle/release/app-release.aab
            track: internal
            status: completed
            whatsNewDirectory: distribution/whatsnew
  ```

- [ ] **6.3** Verify the YAML is syntactically valid:

  ```bash
  python3 -c "import yaml; yaml.safe_load(open('D:/RestoreAssist/.github/workflows/android-release.yml'))" && echo "YAML OK"
  ```

  Expected output: `YAML OK`

- [ ] **6.4** Commit:
  ```bash
  git add .github/workflows/android-release.yml distribution/whatsnew/whatsnew-en-AU
  git commit -m "feat(ci): Android release workflow with Google Play internal track upload"
  ```

---

## Task 7: `.github/workflows/ios-release.yml`

**Scope:** New GitHub Actions workflow for iOS release. Uses a `macos-latest` runner, installs Fastlane via gem, and calls `fastlane gym` + `fastlane pilot` to build and upload to TestFlight.

**NOTE: USER ACTION REQUIRED** — This workflow requires every Apple secret listed in the Prerequisites section. The App Store Connect app must also be created with bundle ID `com.restoreassist.app` before TestFlight uploads are accepted.

- [ ] **7.1** Write the workflow file.

  **File:** `D:/RestoreAssist/.github/workflows/ios-release.yml`

  ```yaml
  # iOS Release — App Store / TestFlight
  #
  # Triggered by tags matching "ios-v*" (e.g. ios-v1.2.0).
  # Builds a signed IPA using Fastlane gym and uploads to TestFlight
  # using Fastlane pilot with an App Store Connect API key.
  #
  # Required GitHub Actions secrets:
  #   ASC_API_KEY_ID              App Store Connect API key ID (e.g. ABC123DEF4)
  #   ASC_ISSUER_ID               App Store Connect issuer ID (UUID)
  #   ASC_PRIVATE_KEY_BASE64      Base64-encoded contents of the .p8 API key file
  #   APPLE_TEAM_ID               Apple Developer team ID (10-char, e.g. ABCDE12345)
  #   IOS_CERTIFICATE_BASE64      Base64-encoded .p12 distribution certificate
  #   IOS_CERTIFICATE_PASSWORD    Password protecting the .p12 file
  #   IOS_PROVISIONING_PROFILE_BASE64  Base64-encoded .mobileprovision file
  #
  # Encode files to base64:
  #   macOS/Linux: base64 -w 0 file.p12
  #   PowerShell:  [Convert]::ToBase64String([IO.File]::ReadAllBytes('file.p12'))
  #
  # Before first run, complete Apple Developer prerequisites documented at:
  #   docs/superpowers/plans/2026-04-06-app-store-setup-plan.md

  name: iOS Release — TestFlight

  on:
    push:
      tags:
        - "ios-v*" # e.g. ios-v1.2.0
    workflow_dispatch: # Allow manual trigger from GitHub Actions UI

  jobs:
    build-and-upload:
      name: Build Signed IPA and Upload to TestFlight
      runs-on: macos-latest

      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Install pnpm
          uses: pnpm/action-setup@v4
          with:
            version: 9

        - name: Set up Node.js
          uses: actions/setup-node@v4
          with:
            node-version: "22"
            cache: "pnpm"

        - name: Install Node dependencies
          run: pnpm install --no-frozen-lockfile

        - name: Install Fastlane
          run: gem install fastlane --no-document

        # Sync Capacitor to copy native plugin changes into the iOS project.
        # No Next.js export needed — server-hosted WebView.
        - name: Sync Capacitor iOS
          run: npx cap sync ios

        # --- Code signing setup ---

        - name: Decode distribution certificate
          run: |
            echo "${{ secrets.IOS_CERTIFICATE_BASE64 }}" | base64 --decode \
              > "$RUNNER_TEMP/ios_distribution.p12"

        - name: Decode provisioning profile
          run: |
            echo "${{ secrets.IOS_PROVISIONING_PROFILE_BASE64 }}" | base64 --decode \
              > "$RUNNER_TEMP/profile.mobileprovision"
            mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
            cp "$RUNNER_TEMP/profile.mobileprovision" \
               ~/Library/MobileDevice/Provisioning\ Profiles/

        - name: Import certificate into a temporary keychain
          run: |
            KEYCHAIN_PATH="$RUNNER_TEMP/build.keychain"
            KEYCHAIN_PASSWORD="ci-temp-password"

            security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
            security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
            security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

            security import "$RUNNER_TEMP/ios_distribution.p12" \
              -k "$KEYCHAIN_PATH" \
              -P "${{ secrets.IOS_CERTIFICATE_PASSWORD }}" \
              -T /usr/bin/codesign \
              -T /usr/bin/productbuild

            security list-keychains -d user -s "$KEYCHAIN_PATH" login.keychain-db
            security set-key-partition-list \
              -S "apple-tool:,apple:,codesign:" \
              -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

        # --- Decode ASC API key for Fastlane ---

        - name: Write App Store Connect API key file
          run: |
            mkdir -p "$RUNNER_TEMP/asc"
            cat > "$RUNNER_TEMP/asc/api_key.json" <<EOF
            {
              "key_id": "${{ secrets.ASC_API_KEY_ID }}",
              "issuer_id": "${{ secrets.ASC_ISSUER_ID }}",
              "key": "$(echo '${{ secrets.ASC_PRIVATE_KEY_BASE64 }}' | base64 --decode)",
              "in_house": false,
              "duration": 1200
            }
            EOF

        # --- Build IPA with Fastlane gym ---

        - name: Build IPA
          working-directory: ios/App
          run: |
            fastlane gym \
              --scheme "App" \
              --workspace "App.xcworkspace" \
              --configuration "Release" \
              --export_method "app-store" \
              --output_directory "$RUNNER_TEMP/ipa" \
              --output_name "RestoreAssist.ipa" \
              --xcargs "DEVELOPMENT_TEAM=${{ secrets.APPLE_TEAM_ID }}"

        # --- Upload to TestFlight with Fastlane pilot ---

        - name: Upload to TestFlight
          run: |
            fastlane pilot upload \
              --ipa "$RUNNER_TEMP/ipa/RestoreAssist.ipa" \
              --api_key_path "$RUNNER_TEMP/asc/api_key.json" \
              --skip_waiting_for_build_processing true \
              --skip_submission true

        - name: Upload IPA artifact (for debugging)
          if: always()
          uses: actions/upload-artifact@v4
          with:
            name: restoreassist-ios-${{ github.ref_name }}
            path: ${{ runner.temp }}/ipa/RestoreAssist.ipa
            retention-days: 14

        # --- Cleanup sensitive files from runner ---

        - name: Clean up sensitive files
          if: always()
          run: |
            rm -f "$RUNNER_TEMP/ios_distribution.p12"
            rm -f "$RUNNER_TEMP/profile.mobileprovision"
            rm -rf "$RUNNER_TEMP/asc"
            security delete-keychain "$RUNNER_TEMP/build.keychain" 2>/dev/null || true
  ```

- [ ] **7.2** Verify the YAML is syntactically valid:

  ```bash
  python3 -c "import yaml; yaml.safe_load(open('D:/RestoreAssist/.github/workflows/ios-release.yml'))" && echo "YAML OK"
  ```

  Expected output: `YAML OK`

- [ ] **7.3** Verify both workflow files together pass a GitHub Actions lint check (optional but recommended — requires the `actionlint` binary):

  ```bash
  # Install actionlint if not present:
  # macOS: brew install actionlint
  # Linux: go install github.com/rhysd/actionlint/cmd/actionlint@latest
  actionlint D:/RestoreAssist/.github/workflows/android-release.yml D:/RestoreAssist/.github/workflows/ios-release.yml
  ```

  Expected output: no errors. If `actionlint` is not installed, skip this step.

- [ ] **7.4** Commit:
  ```bash
  git add .github/workflows/ios-release.yml
  git commit -m "feat(ci): iOS release workflow with Fastlane gym + pilot TestFlight upload"
  ```

---

## Final Integration Checklist

Before declaring this plan complete, verify the following manually:

### Verification Checklist

**Where to check:** GitHub Actions tab at `https://github.com/CleanExpo/RestoreAssist/actions`

**How to get there:**

1. Push a tag: `git tag android-v0.0.1-test && git push origin android-v0.0.1-test`
2. Navigate to GitHub → Actions → "Android Release — Google Play"

**What to see:**

- Workflow triggers on the `android-v*` tag
- "Build signed AAB" step succeeds
- "Upload to Google Play (internal track)" step shows green (requires Google Play prerequisites)
- An artifact named `restoreassist-release-android-v0.0.1-test` appears in the workflow run

**What NOT to see:**

- "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: not configured" error in the upload step
- Keystore decode errors (would mean `ANDROID_KEYSTORE_BASE64` secret is missing)

**iOS verification (requires macOS runner):**

1. Push a tag: `git tag ios-v0.0.1-test && git push origin ios-v0.0.1-test`
2. Navigate to GitHub → Actions → "iOS Release — TestFlight"
3. The "Build IPA" step runs on `macos-latest`
4. The "Upload to TestFlight" step shows green and returns a build number

**Admin API verification (local):**

1. Start dev server: `pnpm dev`
2. Login as ADMIN user
3. `curl -b <session-cookie> http://localhost:3000/api/admin/publish/google-play?track=internal`
   - Expect: `{ "data": { "track": "internal", "releases": [...] } }` or a 500 with "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured" if env var is not set
4. `curl -b <session-cookie> http://localhost:3000/api/admin/publish/app-store`
   - Expect: `{ "data": { "appId": "...", "builds": [...] } }` or 500 if ASC vars not set
5. `curl -b <session-cookie> http://localhost:3000/api/admin/publish/assets`
   - Expect: `{ "data": { "files": [], "generated": false, "totalCount": 0 } }`

### All Tests (run before marking complete)

```bash
# Run all new unit tests
npx vitest run \
  app/api/admin/publish/google-play/__tests__/route.test.ts \
  app/api/admin/publish/app-store/__tests__/route.test.ts \
  app/api/admin/publish/assets/__tests__/route.test.ts

# Type-check all new files
npx tsc --noEmit \
  app/api/admin/publish/google-play/route.ts \
  app/api/admin/publish/app-store/route.ts \
  app/api/admin/publish/assets/route.ts \
  scripts/generate-store-assets.ts

# Full project lint
pnpm lint
```

Expected unit test output: `✓ 23 tests passed` (9 + 6 + 8)

---

## File Index

All files created or modified by this plan:

| File                                                        | Type     | Task            |
| ----------------------------------------------------------- | -------- | --------------- |
| `.env.example`                                              | Modified | Task 1          |
| `.do/app.yaml`                                              | Modified | Task 1          |
| `.gitignore`                                                | Modified | Task 4          |
| `app/api/admin/publish/google-play/route.ts`                | New      | Task 2          |
| `app/api/admin/publish/google-play/__tests__/route.test.ts` | New      | Task 2          |
| `app/api/admin/publish/app-store/route.ts`                  | New      | Task 3          |
| `app/api/admin/publish/app-store/__tests__/route.test.ts`   | New      | Task 3          |
| `app/api/admin/publish/assets/route.ts`                     | New      | Task 5          |
| `app/api/admin/publish/assets/__tests__/route.test.ts`      | New      | Task 5          |
| `scripts/generate-store-assets.ts`                          | New      | Task 4          |
| `.github/workflows/android-release.yml`                     | New      | Task 6          |
| `.github/workflows/ios-release.yml`                         | New      | Task 7          |
| `distribution/whatsnew/whatsnew-en-AU`                      | New      | Task 6          |
| `package.json` + `pnpm-lock.yaml`                           | Modified | Task 3 (`jose`) |
