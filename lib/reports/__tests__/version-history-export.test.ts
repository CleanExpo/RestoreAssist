import { describe, expect, it } from "vitest";
import { versionHistoryForExport } from "../version-history-export";

describe("version history export", () => {
  it("keeps the invalidation action but excludes the preserved unsafe draft", () => {
    const stored = [{
      version: 2,
      action: "Automatic Basic draft invalidated",
      date: "2026-10-01T19:13:00Z",
      invalidatedDraftSnapshot: { detailedReport: "unsupported conclusion", generatedAt: "2026-10-01T19:13:00Z" },
    }];
    expect(versionHistoryForExport(stored)).toEqual([{
      version: 2,
      action: "Automatic Basic draft invalidated",
      date: "2026-10-01T19:13:00Z",
    }]);
    expect(stored[0].invalidatedDraftSnapshot.detailedReport).toBe("unsupported conclusion");
  });

  it("preserves ordinary version changes", () => {
    const history = [{ version: 1, action: "Initial creation", changes: [{ field: "status", from: null, to: "DRAFT" }] }];
    expect(versionHistoryForExport(history)).toEqual(history);
  });
});
