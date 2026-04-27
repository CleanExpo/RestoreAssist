/**
 * OneDrive stub — ships disabled in v1. The onboarding picker renders
 * the radio option as "Coming soon — AU data centres" and the API
 * endpoint rejects any attempt to save `onedrive` as the provider.
 *
 * When we implement this: Microsoft Graph API, `Files.ReadWrite.AppFolder`
 * scope, folder convention `RestoreAssist/{jobNumber}/`.
 */

import {
  type CloudMirrorProvider,
  type CloudMirrorUploadInput,
  type CloudMirrorUploadResult,
  NotImplementedError,
} from "./provider";

export class OneDriveCloudMirror implements CloudMirrorProvider {
  readonly id = "onedrive" as const;

  upload(_input: CloudMirrorUploadInput): Promise<CloudMirrorUploadResult> {
    throw new NotImplementedError("onedrive");
  }

  revoke(_providerFileId: string): Promise<void> {
    throw new NotImplementedError("onedrive");
  }

  quotaRemaining(): Promise<number | null> {
    throw new NotImplementedError("onedrive");
  }
}
