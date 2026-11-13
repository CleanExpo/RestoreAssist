/**
 * GET /api/margot/access is a platform-staff probe, not a tenant surface.
 *
 * `role: "ADMIN"` is every self-registered business owner, so a DB-verified
 * ADMIN of some other organisation must be refused outright — not handed a 200
 * describing the operator allowlist and dev-open configuration. The allowlisted
 * operator is the positive control: same route, same mocks, only the allowlist
 * differs, so the 403 is the gate and not a mock artefact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STAFF = "staff-operator-margot-access";
const OTHER_ORG_ADMIN = "self-signup-admin-other-org";

const getServerSession = vi.fn();
const users: Record<string, { id: string; role: string; organizationId: string | null }> = {
  [STAFF]: { id: STAFF, role: "ADMIN", organizationId: "org-restoreassist" },
  [OTHER_ORG_ADMIN]: {
    id: OTHER_ORG_ADMIN,
    role: "ADMIN",
    organizationId: "org-other-firm",
  },
};

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users[where.id] ?? null,
    },
  };
  return { prisma, default: prisma };
});

import { GET } from "../route";

function signInAs(id: string) {
  getServerSession.mockResolvedValue({
    user: { id, role: users[id].role },
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", `someone-else, ${STAFF}`);
  vi.stubEnv("PLATFORM_SUPPORT_DEV_OPEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/margot/access", () => {
  it("refuses a self-signup ADMIN of another organisation with 403 and discloses nothing", async () => {
    signInAs(OTHER_ORG_ADMIN);
    const res = await GET();
    const body = await res.text();
    expect(res.status).toBe(403);
    expect(body).not.toContain(OTHER_ORG_ADMIN);
    expect(body).not.toContain("allowlistConfigured");
    expect(body).not.toContain("PLATFORM_SUPPORT");
  });

  it("refuses an unauthenticated caller with 401", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("lets the allowlisted platform operator through with allowed: true", async () => {
    signInAs(STAFF);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ allowed: true, userId: STAFF, role: "ADMIN" });
  });
});
