import { RestoreJobStatus, RestoreMode, MirrorJobKind } from "@prisma/client";

describe("StorageRestoreJob enums", () => {
  it("exposes the restore status values", () => {
    expect(RestoreJobStatus.PENDING).toBe("PENDING");
    expect(RestoreJobStatus.SKIPPED).toBe("SKIPPED");
    expect(RestoreJobStatus.DEAD_LETTER).toBe("DEAD_LETTER");
  });
  it("exposes the restore mode values", () => {
    expect(RestoreMode.MISSING).toBe("MISSING");
    expect(RestoreMode.FORCE).toBe("FORCE");
  });
  it("reuses MirrorJobKind", () => {
    expect(MirrorJobKind.PHOTO).toBe("PHOTO");
  });
});
