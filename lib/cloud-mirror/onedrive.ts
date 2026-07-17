/**
 * OneDrive cloud mirror — Microsoft Graph API implementation.
 *
 * OAuth tokens live on the user's linked `Account` row (provider = "azure-ad").
 * Folder convention: `RestoreAssist/{jobNumber}/`.
 * Enabled when `MICROSOFT_CLIENT_ID` is set (see PROVIDER_CATALOG).
 */

import { prisma } from "@/lib/prisma";
import { decryptAccountTokens, encryptAccountTokens } from "@/lib/auth/account-tokens";
import {
  type CloudMirrorProvider,
  type CloudMirrorUploadInput,
  type CloudMirrorUploadResult,
} from "./provider";

const ROOT_FOLDER_NAME = "RestoreAssist";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MAX_RETRY = 3;

/** Pure helper — Graph path for a job folder or file inside it. */
export function buildOneDriveFolderPath(jobNumber: string): string {
  const safeJob = jobNumber.replace(/[/\\:*?"<>|]/g, "-").trim() || "unfiled";
  return `${ROOT_FOLDER_NAME}/${safeJob}`;
}

/** Graph item path including optional filename (for upload/content endpoints). */
export function buildOneDriveItemPath(
  jobNumber: string,
  filename?: string,
): string {
  const folder = buildOneDriveFolderPath(jobNumber);
  if (!filename) return folder;
  const safeName = filename.replace(/[/\\:*?"<>|]/g, "-").trim() || "file";
  return `${folder}/${safeName}`;
}

export function getMicrosoftTenantId(): string {
  return process.env.MICROSOFT_TENANT_ID?.trim() || "common";
}

export function buildMicrosoftAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string {
  const tenant = getMicrosoftTenantId();
  const scopes = input.scopes ?? [
    "offline_access",
    "User.Read",
    "Files.ReadWrite",
  ];
  const params = new URLSearchParams({
    client_id: input.clientId,
    response_type: "code",
    redirect_uri: input.redirectUri,
    response_mode: "query",
    scope: scopes.join(" "),
    state: input.state,
  });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
}

async function graphFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
}

function encodeGraphPath(segments: string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status !== 429 && status !== 500 && status !== 502 && status !== 503) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function getTokensForUser(userId: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
}> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "azure-ad" },
    select: { access_token: true, refresh_token: true },
  });
  if (!account?.access_token) {
    throw new Error(
      "Microsoft account not linked for this user — connect OneDrive in Settings → Cloud mirror before mirroring.",
    );
  }
  const tokens = decryptAccountTokens(account);
  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token ?? null,
  };
}

async function ensureFolderPath(
  accessToken: string,
  folderPath: string,
): Promise<void> {
  const segments = folderPath.split("/").filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    const partial = segments.slice(0, i + 1);
    const encoded = encodeGraphPath(partial);
    const check = await graphFetch(
      accessToken,
      `/me/drive/root:/${encoded}`,
    );
    if (check.ok) continue;
    if (check.status !== 404) {
      const body = await check.text().catch(() => "");
      throw new Error(
        `OneDrive folder lookup failed (${check.status}): ${body.slice(0, 200)}`,
      );
    }
    const parent = partial.slice(0, -1);
    const parentSegment = parent.length
      ? `/me/drive/root:/${encodeGraphPath(parent)}:/children`
      : "/me/drive/root/children";
    const create = await graphFetch(accessToken, parentSegment, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: partial[partial.length - 1],
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
    if (!create.ok && create.status !== 409) {
      const body = await create.text().catch(() => "");
      throw new Error(
        `OneDrive folder create failed (${create.status}): ${body.slice(0, 200)}`,
      );
    }
  }
}

export async function uploadToOneDrive(input: {
  accessToken: string;
  jobNumber: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}): Promise<{ providerFileId: string; viewUrl: string }> {
  const folderPath = buildOneDriveFolderPath(input.jobNumber);
  await ensureFolderPath(input.accessToken, folderPath);

  const itemPath = buildOneDriveItemPath(input.jobNumber, input.filename);
  const uploadPath = `/me/drive/root:/${encodeGraphPath(itemPath.split("/"))}:/content`;

  const res = await withBackoff(async () => {
    const response = await graphFetch(input.accessToken, uploadPath, {
      method: "PUT",
      headers: { "Content-Type": input.mimeType },
      body: new Uint8Array(input.data),
    });
    if (!response.ok) {
      const err = new Error(
        `OneDrive upload failed (${response.status})`,
      ) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
    return response;
  });

  const item = (await res.json()) as { id?: string; webUrl?: string };
  if (!item.id || !item.webUrl) {
    throw new Error("OneDrive upload completed without id or webUrl");
  }
  return { providerFileId: item.id, viewUrl: item.webUrl };
}

export class OneDriveCloudMirror implements CloudMirrorProvider {
  readonly id = "onedrive" as const;

  constructor(private readonly userId: string) {}

  async upload(
    input: CloudMirrorUploadInput,
  ): Promise<CloudMirrorUploadResult> {
    const { accessToken } = await getTokensForUser(this.userId);
    return uploadToOneDrive({
      accessToken,
      jobNumber: input.jobNumber,
      filename: input.filename,
      mimeType: input.mimeType,
      data: input.data,
    });
  }

  async revoke(providerFileId: string): Promise<void> {
    const { accessToken } = await getTokensForUser(this.userId);
    await withBackoff(async () => {
      const response = await graphFetch(
        accessToken,
        `/me/drive/items/${encodeURIComponent(providerFileId)}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 404) {
        const err = new Error(
          `OneDrive delete failed (${response.status})`,
        ) as Error & { status?: number };
        err.status = response.status;
        throw err;
      }
    });
  }

  async quotaRemaining(): Promise<number | null> {
    const { accessToken } = await getTokensForUser(this.userId);
    const res = await graphFetch(accessToken, "/me/drive?$select=quota");
    if (!res.ok) return null;
    const data = (await res.json()) as {
      quota?: { total?: number; used?: number };
    };
    const total = data.quota?.total;
    const used = data.quota?.used;
    if (total == null || used == null) return null;
    const remaining = total - used;
    return Number.isFinite(remaining) ? remaining : null;
  }
}

export async function exchangeMicrosoftCodeForTokens(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
}> {
  const tenant = getMicrosoftTenantId();
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microsoft token exchange failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token) {
    throw new Error("Microsoft token exchange returned no access_token");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
    scope: json.scope ?? null,
  };
}

export async function fetchMicrosoftUserProfile(accessToken: string): Promise<{
  id: string;
  email: string | null;
}> {
  const res = await graphFetch(accessToken, "/me?$select=id,mail,userPrincipalName");
  if (!res.ok) {
    throw new Error(`Microsoft Graph /me failed (${res.status})`);
  }
  const data = (await res.json()) as {
    id?: string;
    mail?: string | null;
    userPrincipalName?: string | null;
  };
  if (!data.id) throw new Error("Microsoft Graph /me returned no id");
  return {
    id: data.id,
    email: data.mail ?? data.userPrincipalName ?? null,
  };
}

/** Upsert azure-ad Account row with encrypted tokens. */
export async function upsertMicrosoftAccount(input: {
  userId: string;
  providerAccountId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
}): Promise<void> {
  const tokenPayload = encryptAccountTokens({
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    id_token: null,
  });

  const existing = await prisma.account.findFirst({
    where: { userId: input.userId, provider: "azure-ad" },
    select: { id: true },
  });

  const data = {
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token,
    expires_at: input.expiresAt
      ? Math.floor(input.expiresAt.getTime() / 1000)
      : null,
    token_type: "Bearer",
    scope: input.scope,
  };

  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  await prisma.account.create({
    data: {
      userId: input.userId,
      type: "oauth",
      provider: "azure-ad",
      providerAccountId: input.providerAccountId,
      ...data,
    },
  });
}
