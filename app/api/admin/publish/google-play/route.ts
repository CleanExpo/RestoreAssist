import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";

function getAndroidPublisher() {
  const serviceAccountJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured");
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  return google.androidpublisher({ version: "v3", auth });
}

const PACKAGE_NAME = "com.restoreassist.app";

/**
 * GET /api/admin/publish/google-play?track=internal|alpha|beta|production
 * Returns track release data for the given track.
 * Opens a transient edit, reads track state, then deletes the edit.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const track =
    (searchParams.get("track") as
      | "internal"
      | "alpha"
      | "beta"
      | "production") ?? "internal";

  try {
    const androidpublisher = getAndroidPublisher();

    // Open a transient edit
    const editResponse = await androidpublisher.edits.insert({
      packageName: PACKAGE_NAME,
    });
    const editId = editResponse.data.id!;

    try {
      // Read track state
      const trackResponse = await androidpublisher.edits.tracks.get({
        packageName: PACKAGE_NAME,
        editId,
        track,
      });

      return NextResponse.json({ data: trackResponse.data });
    } finally {
      // Always delete the transient edit
      await androidpublisher.edits
        .delete({
          packageName: PACKAGE_NAME,
          editId,
        })
        .catch((err: unknown) => {
          console.warn("Failed to delete transient edit:", err);
        });
    }
  } catch (error) {
    console.error("Google Play API error (GET):", error);
    return NextResponse.json(
      { error: "Failed to fetch track data from Google Play" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/publish/google-play
 * Body: { fromTrack?: string; toTrack?: string; versionCodes?: number[] }
 * Promotes a release between tracks.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    fromTrack?: string;
    toTrack?: string;
    versionCodes?: number[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { fromTrack = "internal", toTrack = "alpha", versionCodes } = body;

  try {
    const androidpublisher = getAndroidPublisher();

    // Open a new edit
    const editResponse = await androidpublisher.edits.insert({
      packageName: PACKAGE_NAME,
    });
    const editId = editResponse.data.id!;

    // Read source track
    const sourceTrackResponse = await androidpublisher.edits.tracks.get({
      packageName: PACKAGE_NAME,
      editId,
      track: fromTrack,
    });

    const sourceReleases = sourceTrackResponse.data.releases ?? [];
    const latestRelease = sourceReleases[0];

    if (!latestRelease) {
      await androidpublisher.edits
        .delete({ packageName: PACKAGE_NAME, editId })
        .catch(() => {});
      return NextResponse.json(
        { error: `No releases found on track: ${fromTrack}` },
        { status: 404 },
      );
    }

    // Determine version codes to promote
    const promotedVersionCodes =
      versionCodes?.map(String) ?? latestRelease.versionCodes ?? [];

    // Promote to destination track
    await androidpublisher.edits.tracks.update({
      packageName: PACKAGE_NAME,
      editId,
      track: toTrack,
      requestBody: {
        track: toTrack,
        releases: [
          {
            versionCodes: promotedVersionCodes,
            status: "completed",
            releaseNotes: latestRelease.releaseNotes,
          },
        ],
      },
    });

    // Commit the edit
    const commitResponse = await androidpublisher.edits.commit({
      packageName: PACKAGE_NAME,
      editId,
    });

    return NextResponse.json({
      data: {
        editId,
        commitExpiry: commitResponse.data.expiryTimeSeconds,
        fromTrack,
        toTrack,
        promotedVersionCodes,
      },
    });
  } catch (error) {
    console.error("Google Play API error (POST):", error);
    return NextResponse.json(
      { error: "Failed to promote release on Google Play" },
      { status: 500 },
    );
  }
}
