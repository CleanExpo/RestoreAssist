import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const f = vi.hoisted(() => ({ session: vi.fn(), owner: vi.fn(), transaction: vi.fn(), calls: [] as string[], rows: [] as Array<Record<string, unknown>>, country: "AU", audit: vi.fn(), create: vi.fn(), remove: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: f.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { inspection: { findFirst: f.owner }, $transaction: f.transaction } }));
import { POST, DELETE } from "../route";
const params = { params: Promise.resolve({ id: "i1" }) };
const request = (method: string) => new NextRequest("http://localhost/api/inspections/i1/cost-estimates/spm", { method, body: JSON.stringify({ inspectionId: "other", country: "AU", rate: 1, total: 1, rowId: "work" }) });

describe("explicit SPM actions", () => {
  beforeEach(() => {
    vi.clearAllMocks(); f.calls = []; f.rows = [{ id: "work", total: 3000, lineKind: null }]; f.country = "AU";
    f.session.mockResolvedValue({ user: { id: "u1" } }); f.owner.mockResolvedValue({ id: "i1", propertyCountry: "AU" });
    f.create.mockImplementation(async ({ data }) => { f.calls.push("write"); const row = { id: "spm", ...data }; f.rows.push(row); return row; });
    f.remove.mockImplementation(async ({ where }) => { f.calls.push("delete"); expect(where).toEqual({ inspectionId: "i1", lineKind: "SPM" }); const n = f.rows.length; f.rows = f.rows.filter(r => r.lineKind !== "SPM"); return { count: n - f.rows.length }; });
    f.audit.mockImplementation(async () => { f.calls.push("audit"); });
    f.transaction.mockImplementation(async fn => {
      const result = await fn({
        $queryRaw: async () => { f.calls.push("lock"); return [{ id: "i1" }]; },
        inspection: { findUnique: async () => { f.calls.push("country"); return { propertyCountry: f.country }; } },
        costEstimate: {
          findFirst: async () => { f.calls.push("read"); return f.rows.find(r => r.lineKind === "SPM") ?? null; },
          findMany: async () => { f.calls.push("list"); return [...f.rows]; },
          create: f.create, deleteMany: f.remove,
        }, auditLog: { create: f.audit },
      });
      f.calls.push("commit"); return result;
    });
  });
  it("creates at the fixed price, ignores the body and audits before commit", async () => {
    const res = await POST(request("POST"), params); expect(res.status).toBe(201);
    expect(f.owner).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "i1", userId: "u1" } }));
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inspectionId: "i1", lineKind: "SPM", quantity: 2, rate: 175, total: 350, contingency: 0 }) }));
    expect(f.calls).toEqual(["lock", "country", "read", "write", "audit", "list", "commit"]);
    expect(f.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "SPM line added", userId: "u1", changes: JSON.stringify({ costEstimateId: "spm", amountExGst: 350, outcome: "added" }) }) });
    const body = await res.json(); expect(body.costEstimates).toHaveLength(2); expect(body.spmRecommendation.recommended).toBe(false);
  });
  it("a second Add is a 200 no-op, never an added audit", async () => {
    await POST(request("POST"), params); f.audit.mockClear(); f.create.mockClear();
    expect((await POST(request("POST"), params)).status).toBe(200);
    expect(f.create).not.toHaveBeenCalled(); expect(f.audit.mock.calls[0][0].data.action).toBe("SPM line add (already present)");
    expect(JSON.parse(f.audit.mock.calls[0][0].data.changes).outcome).toBe("already_present");
  });
  it("removes only the marker row and returns the invoice note", async () => {
    await POST(request("POST"), params); f.calls = []; f.audit.mockClear();
    const res = await DELETE(request("DELETE"), params); expect(res.status).toBe(200);
    expect(f.calls).toEqual(["lock", "country", "read", "delete", "audit", "list", "commit"]);
    expect(f.audit.mock.calls[0][0].data.action).toBe("SPM line removed");
    const body = await res.json(); expect(body.costEstimates.map((r: { id: string }) => r.id)).toEqual(["work"]);
    expect(body.spmRecommendation.recommended).toBe(true); expect(body.note).toBe("If this estimate was already sent to Xero or an insurer system, update or void it there.");
  });
  it("absent Remove logs only absent", async () => {
    expect((await DELETE(request("DELETE"), params)).status).toBe(200);
    expect(f.audit.mock.calls[0][0].data.action).toBe("SPM line remove (absent)");
    expect(JSON.parse(f.audit.mock.calls[0][0].data.changes).outcome).toBe("absent");
  });
  it.each([POST, DELETE])("non-owner: 404 and no transaction", async handler => {
    f.owner.mockResolvedValue(null); expect((await handler(request(handler === POST ? "POST" : "DELETE"), params)).status).toBe(404);
    expect(f.transaction).not.toHaveBeenCalled(); expect(f.audit).not.toHaveBeenCalled();
  });
  it.each([POST, DELETE])("NZ from database: 400, no row writes or audit", async handler => {
    f.country = "NZ"; expect((await handler(request(handler === POST ? "POST" : "DELETE"), params)).status).toBe(400);
    expect(f.create).not.toHaveBeenCalled(); expect(f.remove).not.toHaveBeenCalled(); expect(f.audit).not.toHaveBeenCalled();
  });
  it("requires a session", async () => { f.session.mockResolvedValue(null); expect((await POST(request("POST"), params)).status).toBe(401); expect(f.transaction).not.toHaveBeenCalled(); });
  it("transaction errors return a safe 500", async () => { f.transaction.mockRejectedValue(new Error("private detail")); const res = await POST(request("POST"), params); expect(res.status).toBe(500); expect(await res.text()).not.toContain("private detail"); });
});
