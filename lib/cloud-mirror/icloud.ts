/**
 * iCloud stub — ships disabled in v1.
 *
 * iCloud Drive has no public file-upload API; the only viable path is
 * CloudKit Web Services, which requires an Apple Developer programme
 * account + CloudKit container provisioning. Flagged for a later ticket.
 */

import {
  type CloudMirrorProvider,
  type CloudMirrorUploadInput,
  type CloudMirrorUploadResult,
  NotImplementedError,
} from "./provider";

export class ICloudCloudMirror implements CloudMirrorProvider {
  readonly id = "icloud" as const;

  upload(_input: CloudMirrorUploadInput): Promise<CloudMirrorUploadResult> {
    throw new NotImplementedError("icloud");
  }

  revoke(_providerFileId: string): Promise<void> {
    throw new NotImplementedError("icloud");
  }

  quotaRemaining(): Promise<number | null> {
    throw new NotImplementedError("icloud");
  }
}
