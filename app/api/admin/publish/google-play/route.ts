import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  verifyAdminFromDb,
  verifyStorePublishingOperator,
} from "@/lib/admin-auth";
import { apiError, fromException } from "@/lib/api-errors";
import { google } from "googleapis";

const GOOGLE_PLAY_TRACKS = ["internal", "alpha", "beta", "production"] as const;
type GooglePlayTrack = (typeof GOOGLE_PLAY_TRACKS)[number];

function isGooglePlayTrack(value: unknown): value is GooglePlayTrack {
  return (
    typeof value === "string" &&
    GOOGLE_PLAY_TRACKS.includes(value as GooglePlayTrack)
  );
}

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
 * Auth: explicitly configured store-publishing operator only.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const adminAuth = await verifyAdminFromDb(session);
  if (adminAuth.response) return adminAuth.response;
  const operatorAuth = verifyStorePublishingOperator(adminAuth);
  if (operatorAuth.response) return operatorAuth.response;

  const { searchParams } = new URL(req.url);
  const requestedTrack = searchParams.get("track") ?? "internal";
  if (!isGooglePlayTrack(requestedTrack)) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid Google Play track",
      status: 400,
    });
  }
  const track = requestedTrack;

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
    return fromException(req, error, { stage: "google-play-get" });
  }
}

/**
 * POST /api/admin/publish/google-play
 * Body: { fromTrack?: string; toTrack?: string; versionCodes?: number[] }
 * Promotes a release between tracks.
 * Auth: explicitly configured store-publishing operator only.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const adminAuth = await verifyAdminFromDb(session);
  if (adminAuth.response) return adminAuth.response;
  const operatorAuth = verifyStorePublishingOperator(adminAuth);
  if (operatorAuth.response) return operatorAuth.response;

  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid request body",
      status: 400,
    });
  }

  const fromTrack = body.fromTrack ?? "internal";
  const toTrack = body.toTrack ?? "alpha";
  const versionCodes = body.versionCodes;

  if (!isGooglePlayTrack(fromTrack) || !isGooglePlayTrack(toTrack)) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Invalid Google Play track",
      status: 400,
    });
  }
  if (fromTrack === toTrack) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Source and destination tracks must differ",
      status: 400,
    });
  }
  if (
    versionCodes !== undefined &&
    (!Array.isArray(versionCodes) ||
      versionCodes.length === 0 ||
      versionCodes.some(
        (code) => !Number.isSafeInteger(code) || Number(code) <= 0,
      ))
  ) {
    return apiError(req, {
      code: "VALIDATION",
      message: "versionCodes must contain positive integers",
      status: 400,
    });
  }

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
      return apiError(req, {
        code: "NOT_FOUND",
        message: `No releases found on track: ${fromTrack}`,
        status: 404,
      });
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
    return fromException(req, error, { stage: "google-play-post" });
  }
}
