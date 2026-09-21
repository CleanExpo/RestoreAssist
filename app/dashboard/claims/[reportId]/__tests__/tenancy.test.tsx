/**
 * RA-7628 — the claim detail page reads the claim server-side (address,
 * transitions, attestation signatures), so its own gate is what stands between
 * one business's admin and another business's claim.
 *
 * It used to admit anyone whose SESSION said `role: "ADMIN"` — and every firm
 * that self-registers is ADMIN of its own account. It now asks the real
 * `assertReportTenancy` (run here against a mocked prisma) BEFORE the claim is
 * read.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/components/progress/ClaimActions", () => ({
  default: () => null,
}));

const userFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const claimProgressFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    report: { findUnique: (...a: unknown[]) => reportFindUnique(...a) },
    claimProgress: {
      findUnique: (...a: unknown[]) => claimProgressFindUnique(...a),
    },
    progressTransition: { findMany: vi.fn(async () => []) },
    progressAttestation: { findMany: vi.fn(async () => []) },
  },
}));

import ClaimDetailPage from "../page";

const REPORT_ID = "r_business_b";
const USERS: Record<
  string,
  { role: string; organizationId: string | null; isJuniorTechnician: boolean }
> = {
  u_admin_a: { role: "ADMIN", organizationId: "org_a", isJuniorTechnician: false },
  u_admin_b: { role: "ADMIN", organizationId: "org_b", isJuniorTechnician: false },
};

function signInAs(userId: string) {
  getServerSession.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
}

const props = () => ({ params: Promise.resolve({ reportId: REPORT_ID }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  userFindUnique.mockImplementation(
    async (args: { where: { id: string } }) => USERS[args.where.id] ?? null,
  );
  reportFindUnique.mockResolvedValue({
    id: REPORT_ID,
    userId: "u_owner_b",
    user: { organizationId: "org_b" },
  });
  claimProgressFindUnique.mockResolvedValue({
    id: "cp_1",
    reportId: REPORT_ID,
    currentState: "STABILISATION_ACTIVE",
    previousState: null,
    version: 0,
    closedAt: null,
    managerReviewRequired: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    report: {
      id: REPORT_ID,
      userId: "u_owner_b",
      title: "Business B claim",
      propertyAddress: "1 Private St",
      hazardType: "WATER",
      insuranceType: "HOME",
      inspection: null,
    },
  });
});

describe("RA-7628 claim detail page tenancy", () => {
  it("sends an ADMIN of another organisation away without reading the claim", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", undefined);
    signInAs("u_admin_a");

    await expect(ClaimDetailPage(props())).rejects.toThrow(
      "REDIRECT:/dashboard/claims",
    );
    expect(claimProgressFindUnique).not.toHaveBeenCalled();
  });

  it("renders the claim for an ADMIN of the owner's organisation", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", undefined);
    signInAs("u_admin_b");

    await expect(ClaimDetailPage(props())).resolves.toBeTruthy();
    expect(claimProgressFindUnique).toHaveBeenCalled();
  });
});
