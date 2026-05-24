import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const getWorkspaceForUser = vi.fn();
const checkWorkspaceBudget = vi.fn();
const importSketchFromImage = vi.fn();
const logAiUsage = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
  },
}));

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: (...a: unknown[]) => getWorkspaceForUser(...a),
}));

vi.mock("@/lib/ai/budget-guard", () => ({
  checkWorkspaceBudget: (...a: unknown[]) => checkWorkspaceBudget(...a),
}));

vi.mock("@/lib/usage/log-usage", () => ({
  estimateCostUsd: () => 0.01,
  logAiUsage: (...a: unknown[]) => logAiUsage(...a),
}));

vi.mock("@/lib/services/ai/import-sketch-from-image", () => ({
  importSketchFromImage: (...a: unknown[]) => importSketchFromImage(...a),
}));

function makeRequest(bytes: Uint8Array, type = "image/jpeg"): NextRequest {
  const form = new FormData();
  form.append("file", new File([bytes], "sketch.jpg", { type }));

  return new NextRequest(
    "http://localhost/api/inspections/inspection_1/sketches/import-from-image",
    {
      method: "POST",
      body: form,
    },
  );
}

function ctx() {
  return { params: Promise.resolve({ id: "inspection_1" }) };
}

beforeEach(() => {
  getServerSession.mockReset().mockResolvedValue({
    user: { id: "user_1" },
  });
  inspectionFindFirst.mockReset().mockResolvedValue({ id: "inspection_1" });
  getWorkspaceForUser.mockReset().mockResolvedValue(null);
  checkWorkspaceBudget.mockReset().mockResolvedValue({ ok: true });
  importSketchFromImage.mockReset();
  logAiUsage.mockReset();
});

describe("POST /api/inspections/[id]/sketches/import-from-image", () => {
  it("rejects spoofed JPEG content before calling Vision", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x00]);

    const res = await POST(makeRequest(bytes, "image/jpeg"), ctx());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Unsupported file type — use JPEG or PNG" });
    expect(importSketchFromImage).not.toHaveBeenCalled();
  });
});
