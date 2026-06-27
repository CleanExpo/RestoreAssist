import { describe, it, expect, vi, beforeEach } from "vitest";

const { filesGet } = vi.hoisted(() => ({
  filesGet: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    drive: () => ({ files: { get: filesGet } }),
  },
}));

import { downloadFromDrive } from "@/lib/cloud-mirror/drive";

describe("downloadFromDrive", () => {
  beforeEach(() => { filesGet.mockReset(); });

  it("returns the file bytes as a Buffer", async () => {
    // googleapis returns arraybuffer responseType → data is an ArrayBuffer
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    filesGet.mockResolvedValue({ data: bytes });
    const buf = await downloadFromDrive({
      accessToken: "a",
      refreshToken: "r",
      fileId: "file123",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf).toEqual(Buffer.from([1, 2, 3]));
    expect(filesGet).toHaveBeenCalledWith(
      { fileId: "file123", alt: "media" },
      { responseType: "arraybuffer" },
    );
  });

  it("propagates a non-retryable error", async () => {
    filesGet.mockRejectedValue({ response: { status: 404 } });
    await expect(
      downloadFromDrive({ accessToken: "a", refreshToken: "r", fileId: "x" }),
    ).rejects.toBeDefined();
  });
});
