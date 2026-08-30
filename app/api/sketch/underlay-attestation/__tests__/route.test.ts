/**
 * RA-6848 [C2] — the attestation-record route must fail closed: no session →
 * 401; an incomplete attestation → 400 and never recorded; a complete one →
 * 200 with a structured audit line.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/sketch/underlay-attestation", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/sketch/underlay-attestation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401s without a session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(
      post({ holdsRights: true, compliesWithSourceTerms: true }),
    );
    expect(res.status).toBe(401);
  });

  it("retires the unbound endpoint and records nothing", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } });
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await POST(
      post({
        source: "url",
        holdsRights: true,
        compliesWithSourceTerms: false,
      }),
    );
    expect(res.status).toBe(409);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not produce a forgeable success event even for a complete body", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } });
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await POST(
      post({
        source: "url",
        holdsRights: true,
        compliesWithSourceTerms: true,
        inspectionId: "insp-1",
      }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(JSON.stringify(json)).toMatch(/bound to stored image bytes/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
