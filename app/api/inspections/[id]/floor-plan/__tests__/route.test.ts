import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  inspectionFindFirst: vi.fn(),
  inspectionUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  uploadToCloudinary: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mocks.getServerSession(...args),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...args: unknown[]) => mocks.inspectionFindFirst(...args),
      update: (...args: unknown[]) => mocks.inspectionUpdate(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mocks.auditLogCreate(...args),
    },
  },
}));

vi.mock("@/lib/cloudinary", () => ({
  uploadToCloudinary: (...args: unknown[]) => mocks.uploadToCloudinary(...args),
}));

import { POST } from "../route";

const INSPECTION_ID = "inspection_1";
const USER_ID = "user_1";
const MAX_FLOOR_PLAN_BYTES = 10 * 1024 * 1024;

function requestWithoutBody() {
  return new NextRequest(
    `http://localhost/api/inspections/${INSPECTION_ID}/floor-plan`,
    { method: "POST" },
  );
}

function requestWithFile(file: File) {
  const request = requestWithoutBody();
  const formData = new FormData();
  formData.append("file", file);
  vi.spyOn(request, "formData").mockResolvedValue(formData);
  return request;
}

function context(id = INSPECTION_ID) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mocks.getServerSession.mockReset().mockResolvedValue({
    user: { id: USER_ID },
  });
  mocks.inspectionFindFirst.mockReset().mockResolvedValue({
    id: INSPECTION_ID,
  });
  mocks.inspectionUpdate.mockReset();
  mocks.auditLogCreate.mockReset();
  mocks.uploadToCloudinary.mockReset();
});

describe("POST /api/inspections/[id]/floor-plan", () => {
  it("rejects unauthenticated uploads before inspection or body access", async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);
    const request = requestWithoutBody();
    const formData = vi.spyOn(request, "formData");

    const response = await POST(request, context());

    expect(response.status).toBe(401);
    expect(mocks.inspectionFindFirst).not.toHaveBeenCalled();
    expect(formData).not.toHaveBeenCalled();
  });

  it("scopes inspection access to the authenticated owner", async () => {
    mocks.inspectionFindFirst.mockResolvedValueOnce(null);
    const request = requestWithoutBody();
    const formData = vi.spyOn(request, "formData");

    const response = await POST(request, context("inspection_other"));

    expect(response.status).toBe(404);
    expect(mocks.inspectionFindFirst).toHaveBeenCalledWith({
      where: { id: "inspection_other", userId: USER_ID },
    });
    expect(formData).not.toHaveBeenCalled();
    expect(mocks.uploadToCloudinary).not.toHaveBeenCalled();
  });

  it("rejects files over 10 MB before reading their bytes", async () => {
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
      "plan.png",
      {
        type: "image/png",
      },
    );
    Object.defineProperty(file, "size", {
      value: MAX_FLOOR_PLAN_BYTES + 1,
    });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");

    const response = await POST(requestWithFile(file), context());
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(body.error.message).toBe("Floor plan must be 10 MB or smaller");
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.uploadToCloudinary).not.toHaveBeenCalled();
    expect(mocks.inspectionUpdate).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it("rejects spoofed image content before upload or persistence", async () => {
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])],
      "spoofed.jpg",
      { type: "image/jpeg" },
    );

    const response = await POST(requestWithFile(file), context());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toBe(
      "Invalid file type. Only images are allowed.",
    );
    expect(mocks.uploadToCloudinary).not.toHaveBeenCalled();
    expect(mocks.inspectionUpdate).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });
});
