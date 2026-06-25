import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const reportFindUnique = vi.fn();
const reportUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findUnique: (...args: unknown[]) => reportFindUnique(...args),
      update: (...args: unknown[]) => reportUpdate(...args),
    },
  },
}));
vi.mock("@/lib/cloudinary", () => ({
  uploadToCloudinary: vi.fn(),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  reportFindUnique.mockReset();
  reportUpdate.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  reportFindUnique.mockResolvedValue({
    id: "report_1",
    userId: "user_1",
    moistureReadings: null,
  });
});

function postRequest(formData: FormData) {
  return new NextRequest("http://localhost/api/reports/report_1/nir-data", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/reports/[id]/nir-data", () => {
  it("does not expose JSON parser details", async () => {
    const formData = new FormData();
    formData.set("moistureReadings", '{"secret":');

    const response = await POST(postRequest(formData), {
      params: Promise.resolve({ id: "report_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toBe("Invalid JSON in form data");
    // Still no JSON.parse internals (e.g. "...at position 9") leaked.
    expect(body.error.message).not.toContain("position");
  });
});
