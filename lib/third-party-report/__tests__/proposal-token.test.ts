import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ readEnv: () => "test-secret-for-proposals" }));

import { signProposal, verifyProposal, type ProposalPayload } from "../proposal-token";

const payload = (over: Partial<ProposalPayload> = {}): ProposalPayload => ({
  inspectionId: "insp_1",
  userId: "u1",
  sha256: "a".repeat(64),
  fileName: "lab.pdf",
  document: { title: null, author: "Acme", reportDate: null },
  facts: [{ field: "labName", value: "Acme", pageRef: 2, quote: "Acme" }],
  exp: Date.now() + 60_000,
  ...over,
});
const who = { inspectionId: "insp_1", userId: "u1" };

describe("proposal token", () => {
  it("round-trips for the same job and user", () => {
    const v = verifyProposal(signProposal(payload()), who);
    expect(v.ok && v.payload.facts[0]?.pageRef).toBe(2);
  });

  it("rejects a token whose facts were altered after signing", () => {
    const [body, sig] = signProposal(payload()).split(".");
    const forged = JSON.parse(Buffer.from(body!, "base64url").toString());
    forged.facts[0].pageRef = 9;
    const bad = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`;
    expect(verifyProposal(bad, who)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token signed by someone else", () => {
    expect(verifyProposal("abc.def", who).ok).toBe(false);
    expect(verifyProposal("nodots", who)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyProposal("a.b.c", who)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects another job, another user and an expired token", () => {
    const t = signProposal(payload());
    expect(verifyProposal(t, { ...who, inspectionId: "insp_2" })).toEqual({ ok: false, reason: "wrong_job" });
    expect(verifyProposal(t, { ...who, userId: "u2" })).toEqual({ ok: false, reason: "wrong_user" });
    expect(verifyProposal(t, { ...who, now: Date.now() + 3_600_000 })).toEqual({ ok: false, reason: "expired" });
  });
});
