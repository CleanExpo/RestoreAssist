import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const generateContentsManifest = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
    },
  },
}));
vi.mock("@/lib/ai/contents-manifest", () => ({
  generateContentsManifest: (...args: unknown[]) =>
    generateContentsManifest(...args),
  manifestToCsv: vi.fn(),
  estimateManifestCost: vi.fn(),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  generateContentsManifest.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  inspectionFindFirst.mockResolvedValue({
    id: "inspection_1",
    inspectionNumber: "INS-001",
    propertyAddress: "1 Test St",
    inspectionWorkflow: { jobType: "water_damage" },
  });
});

function postRequest() {
  return new NextRequest("http://localhost/api/inspections/contents-manifest", {
    method: "POST",
    body: JSON.stringify({
      inspectionId: "inspection_1",
      model: "claude-sonnet-4-6",
      apiKey: "byok-test-key",
      photos: [
        {
          data: "base64-photo",
          mediaType: "image/jpeg",
          label: "kitchen",
        },
      ],
    }),
  });
}

describe("POST /api/inspections/contents-manifest", () => {
  it("does not expose provider exception details in 500 responses", async () => {
    generateContentsManifest.mockRejectedValueOnce(
      new Error("provider failed with api key byok-test-key"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Contents manifest generation failed" });
  });
});
