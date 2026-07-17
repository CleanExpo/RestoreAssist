import { describe, it, expect } from "vitest";
import {
  buildOneDriveFolderPath,
  buildOneDriveItemPath,
  getMicrosoftTenantId,
} from "@/lib/cloud-mirror/onedrive";

describe("buildOneDriveFolderPath", () => {
  it("returns RestoreAssist/{jobNumber}", () => {
    expect(buildOneDriveFolderPath("JOB-123")).toBe("RestoreAssist/JOB-123");
  });

  it("sanitises unsafe path characters in job numbers", () => {
    expect(buildOneDriveFolderPath('bad/name:test')).toBe(
      "RestoreAssist/bad-name-test",
    );
  });

  it("falls back to unfiled for blank job numbers", () => {
    expect(buildOneDriveFolderPath("   ")).toBe("RestoreAssist/unfiled");
  });
});

describe("buildOneDriveItemPath", () => {
  it("appends filename under the job folder", () => {
    expect(buildOneDriveItemPath("JOB-1", "photo.jpg")).toBe(
      "RestoreAssist/JOB-1/photo.jpg",
    );
  });

  it("returns folder path when filename omitted", () => {
    expect(buildOneDriveItemPath("JOB-1")).toBe("RestoreAssist/JOB-1");
  });
});

describe("getMicrosoftTenantId", () => {
  it("defaults to common when env unset", () => {
    const prev = process.env.MICROSOFT_TENANT_ID;
    delete process.env.MICROSOFT_TENANT_ID;
    expect(getMicrosoftTenantId()).toBe("common");
    if (prev) process.env.MICROSOFT_TENANT_ID = prev;
  });
});
