import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignJWT, importPKCS8 } from "jose";

const ASC_BASE_URL = "https://api.appstoreconnect.apple.com/v1";
const BUNDLE_ID = "com.restoreassist.app";

/**
 * Signs an ES256 JWT for App Store Connect API authentication.
 * Uses ASC_PRIVATE_KEY_BASE64, ASC_API_KEY_ID, and ASC_ISSUER_ID env vars.
 */
async function signAscJwt(): Promise<string> {
  const privateKeyBase64 = process.env.ASC_PRIVATE_KEY_BASE64;
  const keyId = process.env.ASC_API_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID;

  if (!privateKeyBase64 || !keyId || !issuerId) {
    throw new Error(
      "ASC credentials not configured. Required: ASC_PRIVATE_KEY_BASE64, ASC_API_KEY_ID, ASC_ISSUER_ID",
    );
  }

  // Decode base64-encoded PEM private key
  const privateKeyPem = Buffer.from(privateKeyBase64, "base64").toString(
    "utf-8",
  );
  const privateKey = await importPKCS8(privateKeyPem, "ES256");

  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 20 * 60) // 20-minute expiry (ASC max)
    .setIssuer(issuerId)
    .setAudience("appstoreconnect-v1")
    .sign(privateKey);

  return token;
}

/**
 * Fetches app details from App Store Connect.
 * Filters by bundleId = com.restoreassist.app.
 */
async function fetchAppDetails(token: string) {
  const url = new URL(`${ASC_BASE_URL}/apps`);
  url.searchParams.set("filter[bundleId]", BUNDLE_ID);
  url.searchParams.set(
    "fields[apps]",
    "name,bundleId,appStoreVersions,primaryLocale",
  );
  url.searchParams.set("include", "appStoreVersions");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`ASC API error ${res.status}: ${errorBody}`);
  }

  return res.json();
}

/**
 * GET /api/admin/publish/app-store
 * Returns App Store Connect app details for com.restoreassist.app.
 * Auth: ADMIN only.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const token = await signAscJwt();
    const appData = await fetchAppDetails(token);

    const apps = (appData.data ?? []).map(
      (app: {
        id: string;
        attributes: {
          name?: string;
          bundleId?: string;
          primaryLocale?: string;
        };
        relationships?: {
          appStoreVersions?: { data?: { id: string; type: string }[] };
        };
      }) => ({
        id: app.id,
        name: app.attributes.name,
        bundleId: app.attributes.bundleId,
        primaryLocale: app.attributes.primaryLocale,
        appStoreVersionsSummary:
          app.relationships?.appStoreVersions?.data ?? [],
      }),
    );

    return NextResponse.json({ data: apps });
  } catch (error) {
    console.error("App Store Connect API error (GET):", error);
    return NextResponse.json(
      { error: "Failed to fetch App Store Connect app details" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/publish/app-store
 * Body: { action: "submit_review" | "status"; appId?: string }
 * - "status": returns app details (same as GET but can scope to a specific app)
 * - "submit_review": submits the latest version for App Store review
 * Auth: ADMIN only.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action: "submit_review" | "status"; appId?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { action, appId } = body;

  if (!action) {
    return NextResponse.json(
      { error: "Missing required field: action" },
      { status: 400 },
    );
  }

  try {
    const token = await signAscJwt();

    if (action === "status") {
      if (appId) {
        // Fetch specific app details
        const res = await fetch(`${ASC_BASE_URL}/apps/${appId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`ASC API error ${res.status}: ${errorBody}`);
        }

        const data = await res.json();
        return NextResponse.json({ data: data.data });
      }

      // Fall back to listing all apps (same as GET)
      const appData = await fetchAppDetails(token);
      return NextResponse.json({ data: appData.data ?? [] });
    }

    if (action === "submit_review") {
      const resolvedAppId = appId;
      if (!resolvedAppId) {
        return NextResponse.json(
          { error: "appId is required for submit_review action" },
          { status: 400 },
        );
      }

      // Fetch the latest app store version for the app
      const versionsRes = await fetch(
        `${ASC_BASE_URL}/apps/${resolvedAppId}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!versionsRes.ok) {
        const errorBody = await versionsRes.text();
        throw new Error(
          `Failed to fetch app versions: ${versionsRes.status}: ${errorBody}`,
        );
      }

      const versionsData = await versionsRes.json();
      const latestVersion = versionsData.data?.[0];

      if (!latestVersion) {
        return NextResponse.json(
          {
            error:
              "No version in PREPARE_FOR_SUBMISSION state found. Ensure the app version is ready for review.",
          },
          { status: 404 },
        );
      }

      const versionId = latestVersion.id as string;

      // Submit the version for review
      const submitRes = await fetch(
        `${ASC_BASE_URL}/appStoreVersionSubmissions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: {
              type: "appStoreVersionSubmissions",
              relationships: {
                appStoreVersion: {
                  data: {
                    type: "appStoreVersions",
                    id: versionId,
                  },
                },
              },
            },
          }),
        },
      );

      if (!submitRes.ok) {
        const errorBody = await submitRes.text();
        throw new Error(
          `Failed to submit version for review: ${submitRes.status}: ${errorBody}`,
        );
      }

      const submitData = await submitRes.json();
      return NextResponse.json({
        data: {
          message: "Version submitted for App Store review",
          submission: submitData.data,
          versionId,
        },
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (error) {
    console.error("App Store Connect API error (POST):", error);
    return NextResponse.json(
      { error: "Failed to process App Store Connect request" },
      { status: 500 },
    );
  }
}
