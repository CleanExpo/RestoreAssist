import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  assertWrite: vi.fn(),
  writeScoped: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionAssignedWrite: m.assertWrite,
  writeWithinInspectionScope: m.writeScoped,
}));

import { POST } from "../confirm/route";

const SHA = "a".repeat(64);
const ctx = { params: Promise.resolve({ id: "insp_1" }) };

const decision = (over: Record<string, unknown> = {}) => ({
  field: "labName",
  value: "Acme Analytical",
  pageRef: 1,
  quote: "Acme Analytical",
  action: "accept",
  ...over,
});

function req(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/inspections/insp_1/third-party-reports/confirm",
    {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}
const post = (decisions: unknown[], extra: Record<string, unknown> = {}) =>
  POST(req({ sha256: SHA, fileName: "lab.pdf", decisions, ...extra }), ctx);

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.getServerSession.mockResolvedValue({ user: { id: "u1" } });
  m.assertWrite.mockResolvedValue({
    ok: true,
    data: { inspectionManyWhere: { id: "insp_1" } },
  });
  m.findUnique.mockResolvedValue({ labName: "Old Lab" });
  m.upsert.mockResolvedValue({ id: "mra_1" });
  m.auditCreate.mockResolvedValue({});
  // Run the scoped work against a fake transaction.
  m.writeScoped.mockImplementation(async (_where, _data, work) =>
    work({
      mouldRemediationAssessment: { findUnique: m.findUnique, upsert: m.upsert },
      auditLog: { create: m.auditCreate },
    }),
  );
});

describe("POST third-party-reports/confirm", () => {
  it("writes an accepted fact and audits it with the SHA-256 and page", async () => {
    const res = await post([decision()]);
    expect(await res.json()).toEqual({ written: 1, dismissed: 0 });
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { labName: "Acme Analytical" } }),
    );
    const audit = m.auditCreate.mock.calls[0]![0].data;
    expect(audit.userId).toBe("u1");
    const changes = JSON.parse(audit.changes);
    expect(changes.source.sha256).toBe(SHA);
    expect(changes.facts[0]).toEqual({ field: "labName", pageRef: 1, edited: false });
    expect(JSON.parse(audit.previousValue)).toEqual({ labName: "Old Lab" });
  });

  it("writes an edited value, flagged as edited", async () => {
    await post([decision({ action: "edit", value: "Acme Labs Pty Ltd" })]);
    expect(m.upsert.mock.calls[0]![0].update.labName).toBe("Acme Labs Pty Ltd");
    expect(JSON.parse(m.auditCreate.mock.calls[0]![0].data.changes).facts[0].edited).toBe(true);
  });

  it("writes nothing for a dismissed fact: no scope claim, no upsert, no audit", async () => {
    const res = await post([decision({ action: "dismiss" })]);
    expect(await res.json()).toEqual({ written: 0, dismissed: 1 });
    expect(m.writeScoped).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it("writes only the accepted facts when others are dismissed", async () => {
    const res = await post([
      decision(),
      decision({ field: "sporeType", value: "Aspergillus", action: "dismiss" }),
    ]);
    expect(await res.json()).toEqual({ written: 1, dismissed: 1 });
    expect(Object.keys(m.upsert.mock.calls[0]![0].update)).toEqual(["labName"]);
  });

  it("stores a sampling date as a date and a count as a number", async () => {
    await post([
      decision({ field: "samplingDate", value: "2026-09-12" }),
      decision({ field: "outdoorBaselineCount", value: "300" }),
    ]);
    const update = m.upsert.mock.calls[0]![0].update;
    expect(update.samplingDate).toEqual(new Date("2026-09-12T00:00:00.000Z"));
    expect(update.outdoorBaselineCount).toBe(300);
  });

  it("401 without a session", async () => {
    m.getServerSession.mockResolvedValue(null);
    expect((await post([decision()])).status).toBe(401);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("404 for another tenant's job, and nothing is written", async () => {
    m.assertWrite.mockResolvedValue({ ok: false, status: 404, reason: "Not found" });
    expect((await post([decision()])).status).toBe(404);
    expect(m.writeScoped).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("404 when the scoped claim no longer matches, and the audit is not written", async () => {
    m.writeScoped.mockResolvedValue(null);
    expect((await post([decision()])).status).toBe(404);
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown field", decision({ field: "mouldConditionLevel", value: "CONDITION_1" })],
    ["clearance field smuggled as text", decision({ field: "sporeType", value: "Safe to occupy" })],
    ["negative count", decision({ field: "outdoorBaselineCount", value: -1 })],
    ["bad date", decision({ field: "samplingDate", value: "2026-02-31" })],
    ["no page", { ...decision(), pageRef: undefined }],
    ["extra key", { ...decision(), clearance: true }],
  ])("400 and no write for %s", async (_n, bad) => {
    const res = await post([decision({ field: "labReportReference", value: "LR-1" }), bad]);
    expect(res.status).toBe(400);
    expect(m.writeScoped).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("400 for two values for the same field", async () => {
    expect((await post([decision(), decision({ value: "Other" })])).status).toBe(400);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("400 for a bad hash, malformed JSON and an empty body", async () => {
    expect((await post([decision()], { sha256: "nope" })).status).toBe(400);
    expect((await POST(req("{not json"), ctx)).status).toBe(400);
    expect((await POST(req(""), ctx)).status).toBe(400);
  });

  it("an empty decision list writes nothing", async () => {
    const res = await post([]);
    expect(await res.json()).toEqual({ written: 0, dismissed: 0 });
    expect(m.writeScoped).not.toHaveBeenCalled();
  });
});
