/**
 * RA-1459 — Cloud mirror provider interface.
 *
 * Viewing copies of evidence files get mirrored to the customer's own
 * cloud storage so originals in Supabase Blob can be GC'd after the
 * statutory retention window. The provider the user picks at onboarding
 * is persisted on `User.cloudMirrorProvider`.
 */

export type CloudMirrorProviderId = "drive" | "onedrive" | "icloud";

export interface CloudMirrorUploadInput {
  /** Binary file contents. */
  data: Buffer;
  /** Filename as it will appear in the user's cloud folder. */
  filename: string;
  /** MIME type — e.g. "image/jpeg", "application/pdf". */
  mimeType: string;
  /** Job number used for folder convention `RestoreAssist/{jobNumber}/`. */
  jobNumber: string;
}

export interface CloudMirrorUploadResult {
  /** Provider-native ID (e.g. Drive fileId) — stored for later revoke. */
  providerFileId: string;
  /** Public URL the user can share within their cloud provider. */
  viewUrl: string;
}

export interface CloudMirrorProvider {
  readonly id: CloudMirrorProviderId;

  /** Upload a viewing copy. Idempotent on (jobNumber + filename). */
  upload(input: CloudMirrorUploadInput): Promise<CloudMirrorUploadResult>;

  /** Revoke a previously-uploaded file. */
  revoke(providerFileId: string): Promise<void>;

  /**
   * Remaining quota in bytes. Returns `null` when the provider doesn't
   * expose quota (e.g. enterprise plans). Callers should treat `null` as
   * "unknown — don't warn" rather than "zero".
   */
  quotaRemaining(): Promise<number | null>;
}

export class NotImplementedError extends Error {
  readonly provider: CloudMirrorProviderId;

  constructor(provider: CloudMirrorProviderId) {
    super(
      `Cloud mirror provider "${provider}" is not yet available. Only Google Drive ships in v1 — OneDrive and iCloud are coming soon (AU data centres).`,
    );
    this.name = "NotImplementedError";
    this.provider = provider;
  }
}
