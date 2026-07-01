import { describe, it, expect } from "vitest";
import {
  buildInspectionOutboxEntry,
  recordOutbox,
} from "../inspection-outbox";

const inspection = {
  id: "insp_1",
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  propertyAddress: "12 Smith St",
};

describe("buildInspectionOutboxEntry", () => {
  it("builds an upsert entry keyed by inspection id + version", () => {
    const e = buildInspectionOutboxEntry({ workspaceId: "w1", inspection });
    expect(e.workspaceId).toBe("w1");
    expect(e.inspectionId).toBe("insp_1");
    expect(e.op).toBe("upsert");
    expect(e.dedupeKey).toBe("insp_1:2026-07-01T00:00:00.000Z");
    expect(e.payload).toMatchObject({ propertyAddress: "12 Smith St" });
  });

  it("builds a delete entry with a null payload", () => {
    const e = buildInspectionOutboxEntry({
      workspaceId: "w1",
      inspection,
      op: "delete",
    });
    expect(e.op).toBe("delete");
    expect(e.payload).toBeNull();
    expect(e.dedupeKey).toBe("insp_1:delete");
  });
});

describe("recordOutbox (idempotency)", () => {
  it("records a new entry once and drops an exact duplicate", () => {
    const seen = new Set<string>();
    const e = buildInspectionOutboxEntry({ workspaceId: "w1", inspection });

    expect(recordOutbox(e, seen)).toBe(true); // first time
    expect(recordOutbox(e, seen)).toBe(false); // same version → no second row
    expect(seen.size).toBe(1);
  });

  it("records again when the inspection changes (new version)", () => {
    const seen = new Set<string>();
    recordOutbox(buildInspectionOutboxEntry({ workspaceId: "w1", inspection }), seen);

    const changed = {
      ...inspection,
      updatedAt: new Date("2026-07-01T01:00:00.000Z"),
    };
    expect(
      recordOutbox(buildInspectionOutboxEntry({ workspaceId: "w1", inspection: changed }), seen),
    ).toBe(true);
    expect(seen.size).toBe(2);
  });
});
