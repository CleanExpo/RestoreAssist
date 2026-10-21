/**
 * RA-8043b (21/10/2026): the progress telemetry page computes funnels and KPIs
 * over every firm on the platform, and was open to any ADMIN — which is every
 * firm owner. Only the platform support allowlist may now see it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

const viewer = vi.hoisted(() => ({ id: "owner_a" }));
const computeAllFunnels = vi.hoisted(() => vi.fn());
const computeTimeToInvoice = vi.hoisted(() => vi.fn());
const computeOverrideRate = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
// The session is a DB-verified ADMIN — a firm owner unless allowlisted.
vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: viewer.id, role: "ADMIN" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({
  requireAdminPage: async () => ({ id: viewer.id, role: "ADMIN", organizationId: "org_a" }),
}));
vi.mock("@/lib/telemetry/funnels", () => ({
  computeAllFunnels: (...a: unknown[]) => computeAllFunnels(...a),
}));
vi.mock("@/lib/telemetry/kpis", () => ({
  computeTimeToInvoice: (...a: unknown[]) => computeTimeToInvoice(...a),
  computeOverrideRate: (...a: unknown[]) => computeOverrideRate(...a),
}));

import ProgressTelemetryPage from "../page";

async function render(): Promise<string> {
  try {
    await ProgressTelemetryPage();
    return "rendered";
  } catch (e) {
    if (e instanceof Redirect) return e.to;
    throw e;
  }
}

beforeEach(() => {
  viewer.id = "owner_a";
  delete process.env.PLATFORM_SUPPORT_USER_IDS;
  computeAllFunnels.mockReset().mockResolvedValue([]);
  computeTimeToInvoice.mockReset().mockResolvedValue({ medianHours: null, sampleCount: 0 });
  computeOverrideRate.mockReset().mockResolvedValue({ rate: null, overrides: 0, total: 0 });
});

describe("progress telemetry access (RA-8043b)", () => {
  it("sends a firm owner (tenant ADMIN) away before any platform query runs [ra-8043b]", async () => {
    expect(await render()).toBe("/dashboard");
    expect(computeAllFunnels).not.toHaveBeenCalled();
    expect(computeTimeToInvoice).not.toHaveBeenCalled();
    expect(computeOverrideRate).not.toHaveBeenCalled();
  });

  it("refuses everyone when the allowlist is empty [ra-8043b]", async () => {
    process.env.PLATFORM_SUPPORT_USER_IDS = "";
    expect(await render()).toBe("/dashboard");
    expect(computeAllFunnels).not.toHaveBeenCalled();
  });

  it("lets an allowlisted platform support operator see the platform figures", async () => {
    process.env.PLATFORM_SUPPORT_USER_IDS = "staff_1";
    viewer.id = "staff_1";
    expect(await render()).not.toBe("/dashboard");
    expect(computeAllFunnels).toHaveBeenCalled();
  });
});
