/**
 * RA-6934 — the standards-retrieval degradation contract.
 *
 * When standards cannot be grounded from the IICRC Standards Drive folder, the
 * report free-generates IICRC content from general knowledge. That must never
 * happen silently: retrieveRelevantStandards must return `degraded: true` with a
 * machine-readable `degradedReason`, AND fire a loud `[error]` observability
 * alert so ops is paged. These tests lock in both.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { reportError, getStandardsFolderId } = vi.hoisted(() => ({
  reportError: vi.fn(),
  getStandardsFolderId: vi.fn(() => "folder-id"),
}));

vi.mock("../observability", () => ({ reportError }));
vi.mock("../google-drive", () => ({
  getStandardsFolderId: () => getStandardsFolderId(),
  listDriveItems: vi.fn(),
  searchDriveFiles: vi.fn(),
}));

import { retrieveRelevantStandards } from "../standards-retrieval";
import type { RetrievalQuery } from "../standards-retrieval-types";

const query: RetrievalQuery = { reportType: "water" };

describe("retrieveRelevantStandards degradation contract (RA-6934)", () => {
  beforeEach(() => {
    reportError.mockClear();
    getStandardsFolderId.mockReset();
    getStandardsFolderId.mockReturnValue("folder-id");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("flags degraded and alerts when no AI key is available", async () => {
    const ctx = await retrieveRelevantStandards(query);

    expect(ctx.degraded).toBe(true);
    expect(ctx.degradedReason).toBe("no_ai_key");
    expect(ctx.documents).toEqual([]);
    // Loud alert fired for ops (the "not silent" guarantee).
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][1]).toMatchObject({
      stage: "standards-retrieval-degraded",
      degradedReason: "no_ai_key",
    });
  });

  it("flags degraded with the fatal reason when retrieval throws", async () => {
    getStandardsFolderId.mockImplementation(() => {
      throw new Error("GOOGLE_DRIVE_STANDARDS_FOLDER_ID not set");
    });

    const ctx = await retrieveRelevantStandards(query, "sk-ant-test");

    expect(ctx.degraded).toBe(true);
    expect(ctx.degradedReason).toBe("retrieval_fatal_error");
    expect(ctx.documents).toEqual([]);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ degradedReason: "retrieval_fatal_error" }),
    );
  });
});
