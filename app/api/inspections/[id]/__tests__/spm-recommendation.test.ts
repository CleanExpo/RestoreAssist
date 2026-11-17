import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const f = vi.hoisted(() => ({ session: vi.fn(), readable: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), rows: vi.fn(), transaction: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: f.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({ assertInspectionReadable: f.readable, resolveInspectionWrite: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { inspection: { findUnique: f.findUnique, findFirst: f.findFirst }, costEstimate: { findMany: f.rows }, $transaction: f.transaction } }));
vi.mock("@/lib/nir-cost-estimation", () => ({ estimateCosts: vi.fn(), resolveInspectionRates: vi.fn() }));
vi.mock("@/lib/pulse/notify-client-change", () => ({ notifyClientStepChange: vi.fn() }));
import { GET as inspectionGet } from "../route";
import { GET as estimateGet } from "../cost-estimates/route";
const context = { params: Promise.resolve({ id: "i1" }) };
const work = { id: "work", description: "Water extraction", total: 3000, lineKind: null };
beforeEach(() => {
  vi.clearAllMocks(); f.session.mockResolvedValue({ user: { id: "u1" } }); f.readable.mockResolvedValue({ ok: true });
  f.findUnique.mockResolvedValue({ id: "i1", propertyCountry: "AU", costEstimates: [work] });
  f.findFirst.mockResolvedValue({ id: "i1", propertyCountry: "AU" }); f.rows.mockResolvedValue([work]);
});
describe("cold-load saved estimate recommendation", () => {
  it("inspection GET exposes the marker and recommendation without Generate", async () => {
    const response = await inspectionGet(new NextRequest("http://localhost/api/inspections/i1"), context);
    expect(response.status).toBe(200); const body = await response.json();
    expect(body.inspection.spmRecommendation).toMatchObject({ recommended: true, workTotalExGst: 3000, line: { total: 350 } });
    expect(f.findUnique.mock.calls[0][0].include.costEstimates.select.lineKind).toBe(true);
    expect(body.inspection.costEstimates).toEqual([work]); expect(f.transaction).not.toHaveBeenCalled();
  });
  it("inspection GET retains a saved marker and hides the recommendation", async () => {
    f.findUnique.mockResolvedValue({ id: "i1", propertyCountry: "AU", costEstimates: [work, { id: "spm", total: 350, lineKind: "SPM" }] });
    const body = await (await inspectionGet(new NextRequest("http://localhost/api/inspections/i1"), context)).json();
    expect(body.inspection.costEstimates[1].lineKind).toBe("SPM"); expect(body.inspection.spmRecommendation.recommended).toBe(false);
  });
  it("cost-estimates GET returns the same recommendation and applies ownership", async () => {
    const response = await estimateGet(new NextRequest("http://localhost/api/inspections/i1/cost-estimates"), context);
    expect(response.status).toBe(200); expect((await response.json()).spmRecommendation.recommended).toBe(true);
    expect(f.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "i1", userId: "u1" } }));
    expect(f.rows.mock.calls[0][0].select.lineKind).toBe(true);
    f.findFirst.mockResolvedValue(null); f.rows.mockClear();
    expect((await estimateGet(new NextRequest("http://localhost/api/inspections/i1/cost-estimates"), context)).status).toBe(404);
    expect(f.rows).not.toHaveBeenCalled(); expect(f.transaction).not.toHaveBeenCalled();
  });
});
