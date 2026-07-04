/**
 * Offline (no-DB) pin for the ABN checksum-validation branch in PATCH
 * /api/setup/state.
 *
 * The DB-gated suite in route.test.ts already exercises the invalid-ABN
 * path, but only with a non-11-digit string ("not-an-abn"), which
 * `normaliseAbn` already rejects on shape alone. That test can't
 * distinguish `!normalised || !isValidAbn(normalised)` from a weakened
 * `!normalised` — both reject "not-an-abn" identically. This suite mocks
 * prisma so it runs without DATABASE_URL / Docker, and asserts on an
 * 11-digit string that fails only the checksum, which the weakened
 * condition would wrongly accept.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: () => mockGetServerSession(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { PATCH } = await import("../route");

describe("PATCH /api/setup/state — ABN checksum validation (offline)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockFindFirst.mockResolvedValue({ id: "org-1", setupCompletedAt: null });
    mockUpdate.mockResolvedValue({});
  });

  it("rejects an 11-digit ABN that has the right shape but fails the ABR checksum", async () => {
    const req = new Request("http://localhost/api/setup/state", {
      method: "PATCH",
      body: JSON.stringify({ abn: "12345678901" }), // 11 digits, invalid checksum
    });
    const res = await PATCH(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toMatch(/invalid abn/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("accepts a checksum-valid ABN and persists the normalised digits", async () => {
    const req = new Request("http://localhost/api/setup/state", {
      method: "PATCH",
      body: JSON.stringify({ abn: "53 004 085 616" }),
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org-1" },
        data: { abn: "53004085616" },
      }),
    );
  });
});
