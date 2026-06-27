import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the tenancy helper so we control ok/not-ok without a DB.
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(),
}));

// Mock one real tool handler so the happy path never touches prisma.
vi.mock("../take-reading", () => ({
  takeReading: vi.fn(async () => ({ id: "r1", ok: true })),
  takeReadingDefinition: {
    name: "take_reading",
    description: "",
    input_schema: { type: "object" as const, properties: {} },
  },
  takeReadingSchema: { parse: (x: unknown) => x },
}));

import { dispatchTool } from "../index";
import { takeReading } from "../take-reading";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";

const mockTenancy = vi.mocked(assertInspectionTenancy);
const mockTakeReading = vi.mocked(takeReading);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dispatchTool — tool-layer IDOR guard", () => {
  it("refuses to run without an authenticated user context", async () => {
    await expect(
      dispatchTool("take_reading", { inspectionId: "i1" }, undefined),
    ).rejects.toThrow(/without an authenticated user context/);
    expect(mockTenancy).not.toHaveBeenCalled();
    expect(mockTakeReading).not.toHaveBeenCalled();
  });

  it("refuses when inspectionId is missing", async () => {
    await expect(
      dispatchTool("take_reading", {}, { userId: "u1" }),
    ).rejects.toThrow(/requires a string inspectionId/);
    expect(mockTenancy).not.toHaveBeenCalled();
  });

  it("rejects a foreign/non-owned inspection id (the IDOR)", async () => {
    mockTenancy.mockResolvedValue({
      ok: false,
      status: 404,
      reason: "Inspection not found",
    });
    await expect(
      dispatchTool("take_reading", { inspectionId: "someone-elses" }, {
        userId: "u1",
      }),
    ).rejects.toThrow(/tenancy check failed \(404\)/);
    // Critically: the handler never ran.
    expect(mockTakeReading).not.toHaveBeenCalled();
    // And the check was scoped to the caller, not the model-supplied identity.
    expect(mockTenancy).toHaveBeenCalledWith(
      { user: { id: "u1", role: null } },
      "someone-elses",
    );
  });

  it("runs the handler only after tenancy passes", async () => {
    mockTenancy.mockResolvedValue({
      ok: true,
      data: { id: "i1", userId: "u1", workspaceId: null },
    });
    const result = await dispatchTool(
      "take_reading",
      { inspectionId: "i1", location: "wall" },
      { userId: "u1", role: "ADMIN" },
    );
    expect(mockTenancy).toHaveBeenCalledWith(
      { user: { id: "u1", role: "ADMIN" } },
      "i1",
    );
    expect(mockTakeReading).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: "r1", ok: true });
  });
});
