/**
 * RA-1459 — Cloud mirror factory + provider registry.
 *
 * Public surface for evidence-pipeline callers: `getMirror(userId)` →
 * returns the provider the user picked at onboarding, or `null` if they
 * haven't picked yet. Evidence pipeline treats `null` as "keep local,
 * don't mirror yet".
 */

import { prisma } from "@/lib/prisma";
import { DriveCloudMirror } from "./drive";
import { ICloudCloudMirror } from "./icloud";
import { OneDriveCloudMirror } from "./onedrive";
import type { CloudMirrorProvider, CloudMirrorProviderId } from "./provider";

export { type CloudMirrorProvider, type CloudMirrorProviderId, NotImplementedError } from "./provider";

/** Human-facing metadata for the onboarding picker UI. */
export const PROVIDER_CATALOG: {
  id: CloudMirrorProviderId;
  label: string;
  tagline: string;
  enabled: boolean;
}[] = [
  {
    id: "drive",
    label: "Google Drive",
    tagline: "Mirrors to your Google Drive. Folder: RestoreAssist/{JobNumber}/",
    enabled: true,
  },
  {
    id: "onedrive",
    label: "Microsoft OneDrive",
    tagline: "Coming soon — AU data centres",
    enabled: false,
  },
  {
    id: "icloud",
    label: "Apple iCloud",
    tagline: "Coming soon — AU data centres",
    enabled: false,
  },
];

/** Narrow an arbitrary string to a valid provider id. */
export function isProviderId(value: unknown): value is CloudMirrorProviderId {
  return value === "drive" || value === "onedrive" || value === "icloud";
}

export function buildProvider(
  id: CloudMirrorProviderId,
  userId: string,
): CloudMirrorProvider {
  switch (id) {
    case "drive":
      return new DriveCloudMirror(userId);
    case "onedrive":
      return new OneDriveCloudMirror();
    case "icloud":
      return new ICloudCloudMirror();
  }
}

/**
 * Return the mirror provider for this user, or `null` if they haven't
 * completed onboarding. Evidence pipeline calls this on each viewing-copy
 * handoff and no-ops when the return is null.
 */
export async function getMirror(userId: string): Promise<CloudMirrorProvider | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { cloudMirrorProvider: true },
  });
  if (!user?.cloudMirrorProvider || !isProviderId(user.cloudMirrorProvider)) return null;
  return buildProvider(user.cloudMirrorProvider, userId);
}
