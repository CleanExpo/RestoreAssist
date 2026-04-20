/**
 * Google Drive implementation of the CloudMirrorProvider interface.
 *
 * OAuth tokens for Drive are stored on the user's linked Google `Account`
 * row (next-auth PrismaAdapter). The GoogleProvider authorization params
 * request the `drive.file` scope so we can only see/create files this
 * app has authored — users don't grant us access to their entire Drive.
 *
 * Folder convention: `RestoreAssist/{jobNumber}/`.
 */

import { google, type drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import {
  type CloudMirrorProvider,
  type CloudMirrorUploadInput,
  type CloudMirrorUploadResult,
} from "./provider";

const ROOT_FOLDER_NAME = "RestoreAssist";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_RETRY = 3;

function getOAuthClient(accessToken: string, refreshToken: string | null): OAuth2Client {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken ?? undefined,
  });
  return client;
}

async function getTokensForUser(userId: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
}> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true },
  });
  if (!account?.access_token) {
    throw new Error(
      "Google account not linked for this user — Drive mirror is unavailable until they sign in with Google.",
    );
  }
  return {
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
  };
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string | null,
): Promise<string> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and trashed = false${parentClause}`;
  const { data } = await drive.files.list({
    q,
    fields: "files(id, name)",
    pageSize: 1,
  });
  const existing = data.files?.[0]?.id;
  if (existing) return existing;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  const id = created.data.id;
  if (!id) throw new Error("Drive folder creation returned no id");
  return id;
}

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { code?: number; response?: { status?: number } })?.response?.status ?? (err as { code?: number })?.code;
      // Only retry on transient/rate-limit errors. Auth and quota-exceeded
      // surface immediately so the caller can warn the user.
      if (status !== 429 && status !== 500 && status !== 502 && status !== 503) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export class DriveCloudMirror implements CloudMirrorProvider {
  readonly id = "drive" as const;

  constructor(private readonly userId: string) {}

  async upload(input: CloudMirrorUploadInput): Promise<CloudMirrorUploadResult> {
    const { accessToken, refreshToken } = await getTokensForUser(this.userId);
    const auth = getOAuthClient(accessToken, refreshToken);
    const drive = google.drive({ version: "v3", auth });

    const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME, null);
    const jobFolderId = await findOrCreateFolder(drive, input.jobNumber, rootId);

    const { data } = await withBackoff(() =>
      drive.files.create({
        requestBody: {
          name: input.filename,
          parents: [jobFolderId],
        },
        media: {
          mimeType: input.mimeType,
          body: Readable.from(input.data),
        },
        fields: "id, webViewLink",
      }),
    );

    if (!data.id || !data.webViewLink) {
      throw new Error("Drive upload completed without returning id or webViewLink");
    }
    return { providerFileId: data.id, viewUrl: data.webViewLink };
  }

  async revoke(providerFileId: string): Promise<void> {
    const { accessToken, refreshToken } = await getTokensForUser(this.userId);
    const auth = getOAuthClient(accessToken, refreshToken);
    const drive = google.drive({ version: "v3", auth });
    await withBackoff(() => drive.files.delete({ fileId: providerFileId }));
  }

  async quotaRemaining(): Promise<number | null> {
    const { accessToken, refreshToken } = await getTokensForUser(this.userId);
    const auth = getOAuthClient(accessToken, refreshToken);
    const drive = google.drive({ version: "v3", auth });
    const { data } = await drive.about.get({ fields: "storageQuota" });
    const quota = data.storageQuota;
    if (!quota?.limit || !quota?.usage) return null;
    const remaining = Number(quota.limit) - Number(quota.usage);
    return Number.isFinite(remaining) ? remaining : null;
  }
}
