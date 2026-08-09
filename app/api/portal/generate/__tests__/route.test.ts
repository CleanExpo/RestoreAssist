import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const request = new NextRequest(
  "https://restoreassist.app/api/portal/generate",
  {
    method: "POST",
  },
);

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe("POST /api/portal/generate", () => {
  it("still requires an authenticated staff session", async () => {
    mSession.mockResolvedValueOnce(null);
    expect((await POST(request)).status).toBe(401);
  });

  it("refuses to mint a new non-revocable HMAC link", async () => {
    const response = await POST(request);
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      error: { code: "GONE", message: expect.stringContaining("retired") },
    });
  });
});
