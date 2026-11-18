import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/margot/claim-context", () => ({
  loadClaimContext: vi.fn(async () => ({
    baselineCaptured: true,
    monitoringPointCount: 1,
  })),
}));

import { listCompletenessInboxForOwner } from "../org-inbox";
import {
  USERS,
  fakePrisma,
  seed,
} from "@/lib/auth/__tests__/helpers/fake-tenant-db";

const STATUSES = [
  "DRAFT",
  "IN_BILLING",
  "COMPLETED",
  "REJECTED",
  "CLOSED",
  "ARCHIVED",
];

beforeEach(() => {
  seed({
    user: USERS,
    inspection: STATUSES.map((status) => ({
      id: status,
      userId: "admin-a",
      status,
      propertyAddress: "1 Test St",
      inspectionNumber: status,
      clientId: null,
      createdAt: new Date(2026, 8, 1),
      updatedAt: new Date(2026, 9, 1),
    })),
    inspectionPhoto: [],
    waterDamageClassification: [],
  });
});

describe("completeness inbox status list (RA-8146)", () => {
  it("leaves out finished and rejected jobs, using the one active definition", async () => {
    const rows = await listCompletenessInboxForOwner(fakePrisma as never, {
      userId: "admin-a",
      organizationId: "org-a",
    });
    expect(rows.map((r) => r.status).sort()).toEqual(["DRAFT", "IN_BILLING"]);
  });
});
