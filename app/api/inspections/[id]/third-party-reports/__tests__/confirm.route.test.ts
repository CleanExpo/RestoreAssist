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
vi.mock("@/lib/env", () => ({ readEnv: () => "test-secret-for-proposals" }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionAssignedWrite: m.assertWrite,
  writeWithinInspectionScope: m.writeScoped,
}));

import { POST } from "../confirm/route";
import { signProposal } from "@/lib/third-party-report/proposal-token";

const SHA = "a".repeat(64);
const ctx = { params: Promise.resolve({ id: "insp_1" }) };

const FACTS = [
  { field: "labName", value: "Acme Analytical", pageRef: 1, quote: "Acme Analytical" },
  { field: "sporeCountPreRemediation", value: 5000, pageRef: 4, quote: "5000" },
  { field: "sporeCountPreRemediation", value: 7000, pageRef: 5, quote: "7000" },
  { field: "samplingDate", value: "2026-09-12", pageRef: 2, quote: "12/09/2026" },
  { field: "outdoorBaselineCount", value: 300, pageRef: 4, quote: "300" },
];

const token = (over: Record<string, unknown> = {}) =>
  signProposal({
    inspectionId: "insp_1",
    userId: "u1",
    sha256: SHA,
    fileName: "lab.pdf",
    document: { title: null, author: "Acme", reportDate: "2026-09-13" },
    facts: FACTS as never,
    exp: Date.now() + 60_000,
    ...over,
  });

function req(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/inspections/insp_1/third-party-reports/confirm",
    { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) },
  );
}
const post = (decisions: unknown[], proposalToken = token()) =>
  POST(req({ proposalToken, decisions }), ctx);
const accept = (index: number) => ({ index, action: "accept" });

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
  m.writeScoped.mockImplementation(async (_where, _data, work) =>
    work({
      mouldRemediationAssessment: { findUnique: m.findUnique, upsert: m.upsert },
      auditLog: { create: m.auditCreate },
    }),
  );
});

describe("POST third-party-reports/confirm", () => {
  it("writes an accepted fact from the signed proposal and audits the SHA-256 and page", async () => {
    const res = await post([accept(0)]);
    expect(await res.json()).toEqual({ written: 1, dismissed: 0, applied: { labName: "Acme Analytical" } });
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { labName: "Acme Analytical" } }),
    );
    const audit = m.auditCreate.mock.calls[0]![0].data;
    expect(audit.userId).toBe("u1");
    const changes = JSON.parse(audit.changes);
    expect(changes.source).toMatchObject({ sha256: SHA, fileName: "lab.pdf", author: "Acme" });
    expect(changes.facts[0]).toEqual({ field: "labName", pageRef: 1, edited: false });
    expect(JSON.parse(audit.previousValue)).toEqual({ labName: "Old Lab" });
  });

  it("an edited value is validated, written, and flagged as edited", async () => {
    const res = await post([{ index: 0, action: "edit", value: "Acme Labs Pty Ltd" }]);
    expect((await res.json()).applied).toEqual({ labName: "Acme Labs Pty Ltd" });
    expect(JSON.parse(m.auditCreate.mock.calls[0]![0].data.changes).facts[0].edited).toBe(true);
  });

  it("an edited count comes back as a number, not text", async () => {
    const res = await post([{ index: 1, action: "edit", value: "5200" }]);
    expect((await res.json()).applied).toEqual({ sporeCountPreRemediation: 5200 });
  });

  it("clearing an edited count is refused, not saved as zero", async () => {
    const res = await post([{ index: 1, action: "edit", value: "" }]);
    expect(res.status).toBe(400);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("ignores any value sent with an accept: the proposal's value is written", async () => {
    await post([{ index: 0, action: "accept", value: "Forged Lab" }].map((d) => d as never));
    // strict schema allows value on any action; accept must still use the signed value
    expect(m.upsert.mock.calls[0]![0].update.labName).toBe("Acme Analytical");
  });

  it("writes nothing for a dismissed fact: no scope claim, no upsert, no audit", async () => {
    const res = await post([{ index: 0, action: "dismiss" }]);
    expect(await res.json()).toEqual({ written: 0, dismissed: 1, applied: {} });
    expect(m.writeScoped).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it("writes only accepted facts when others are dismissed or undecided", async () => {
    const res = await post([accept(0), { index: 3, action: "dismiss" }]);
    expect(await res.json()).toMatchObject({ written: 1, dismissed: 1 });
    expect(Object.keys(m.upsert.mock.calls[0]![0].update)).toEqual(["labName"]);
  });

  it("stores a sampling date as a date and a count as a number", async () => {
    await post([accept(3), accept(4)]);
    const update = m.upsert.mock.calls[0]![0].update;
    expect(update.samplingDate).toEqual(new Date("2026-09-12T00:00:00.000Z"));
    expect(update.outdoorBaselineCount).toBe(300);
  });

  it("two indoor samples for one field: accepting both says to choose one, writes nothing", async () => {
    const res = await post([accept(1), accept(2)]);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/Choose one value for Spore count/);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("accepting one of two samples writes that sample's value and page", async () => {
    await post([accept(2), { index: 1, action: "dismiss" }]);
    expect(m.upsert.mock.calls[0]![0].update.sporeCountPreRemediation).toBe(7000);
    expect(JSON.parse(m.auditCreate.mock.calls[0]![0].data.changes).facts[0].pageRef).toBe(5);
  });

  it("refuses a forged, other-job, other-user or expired proposal, and writes nothing", async () => {
    const bad = [
      "forged.token",
      token({ inspectionId: "insp_9" }),
      token({ userId: "someone_else" }),
      token({ exp: Date.now() - 1 }),
    ];
    for (const t of bad) {
      const res = await post([accept(0)], t);
      expect(res.status).toBe(400);
    }
    expect(m.writeScoped).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("refuses an index that is not in the proposal and a repeated index", async () => {
    expect((await post([accept(17)])).status).toBe(400);
    expect((await post([accept(0), accept(0)])).status).toBe(400);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("401 without a session", async () => {
    m.getServerSession.mockResolvedValue(null);
    expect((await post([accept(0)])).status).toBe(401);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("404 for another tenant's job, and nothing is written", async () => {
    m.assertWrite.mockResolvedValue({ ok: false, status: 404, reason: "Not found" });
    expect((await post([accept(0)])).status).toBe(404);
    expect(m.writeScoped).not.toHaveBeenCalled();
  });

  it("404 when the scoped claim no longer matches, and the audit is not written", async () => {
    m.writeScoped.mockResolvedValue(null);
    expect((await post([accept(0)])).status).toBe(404);
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it("400 for malformed JSON, an empty body, extra keys and an edit with a bad value", async () => {
    expect((await POST(req("{not json"), ctx)).status).toBe(400);
    expect((await POST(req(""), ctx)).status).toBe(400);
    expect((await POST(req({ proposalToken: token(), decisions: [], clearance: true }), ctx)).status).toBe(400);
    expect((await post([{ index: 3, action: "edit", value: "31/02/2026" }])).status).toBe(400);
    expect((await post([{ index: 0, action: "edit", value: "<script>" }])).status).toBe(400);
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("an empty decision list writes nothing", async () => {
    const res = await post([]);
    expect(await res.json()).toEqual({ written: 0, dismissed: 0, applied: {} });
    expect(m.writeScoped).not.toHaveBeenCalled();
  });
});
