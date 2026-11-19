import { describe, expect, it } from "vitest";
import {
  planAuthority,
  type AuthorityPlan,
  type Gate,
  type GateState,
} from "../plan";
import { formatMoney } from "../money";
import {
  nswStrataWaterLoss,
  nzRentalNaturalHazard,
  qldCommercialSelfPay,
} from "../fixtures";
import type { JobFacts } from "../types";

function gate(
  plan: AuthorityPlan,
  line: string,
  g: Gate,
): { state: GateState; reason: string } {
  const s = plan.scopes.find((x) => x.scopeLineId === line);
  if (!s) throw new Error(`no scope ${line}`);
  const r = s.gates.find((x) => x.gate === g);
  if (!r) throw new Error(`no gate ${g}`);
  return r;
}

function forms(plan: AuthorityPlan, code: string): AuthorityPlan["forms"] {
  return plan.forms.filter((f) => f.code === code);
}

describe("every plan is preview-only", () => {
  it.each([nswStrataWaterLoss, qldCommercialSelfPay, nzRentalNaturalHazard])(
    "%o never marks anything sendable or released",
    (make) => {
      const plan = planAuthority(make());
      expect(plan.sendable).toBe(false);
      expect(plan.releaseEnabled).toBe(false);
      expect(plan.deposit.enabled).toBe(false);
      expect(plan.forms.length).toBeGreaterThan(0);
      for (const f of plan.forms) {
        expect(f.sendable).toBe(false);
        expect(f.notSendableBecause[0]).toMatch(/Preview only/);
      }
    },
  );
});

describe("case 1: NSW strata water loss", () => {
  const plan = planAuthority(nswStrataWaterLoss());

  it("one signer cannot clear common property, lot fixtures and tenant contents", () => {
    expect(gate(plan, "L1", "WORK").state).toBe("CLEAR");
    expect(gate(plan, "L2", "WORK").state).toBe("MISSING");
    expect(gate(plan, "L2", "WORK").reason).toMatch(
      /not control "Lot 4 floating floor"/,
    );
    expect(gate(plan, "L3", "WORK").state).toBe("MISSING");
    expect(gate(plan, "L3", "WORK").reason).toMatch(
      /not control "Tenant's sofa"/,
    );
  });

  it("an assessor's emailed approval with no spend authority does not clear funding", () => {
    expect(gate(plan, "L4", "PAYER").state).toBe("HOLD");
    expect(gate(plan, "L4", "PAYER").reason).toMatch(
      /no proven authority to commit spend/,
    );
    expect(plan.scopes.find((s) => s.scopeLineId === "L4")?.canStart).toBe(
      false,
    );
  });

  it("never addresses a funding document to a party with no spend authority", () => {
    const funding = plan.forms.filter((f) =>
      ["A04", "A10", "A11"].includes(f.code),
    );
    expect(funding.map((f) => f.recipientPartyId)).not.toContain("asr");
    const l4 = funding.find(
      (f) => f.code === "A04" && f.scopeLineIds.includes("L4"),
    );
    expect(l4?.recipientPartyId).toBeNull();
    expect(l4?.reason).toMatch(/funding party not established/);
    expect(l4?.notSendableBecause).toContain(
      "recipientName: recipient not identified",
    );
  });

  it("holds the variation that takes cumulative make-safe over the fictional limit", () => {
    const r = gate(plan, "L1", "INSURER");
    expect(r.state).toBe("HOLD");
    expect(r.reason).toContain(
      "A$2,400.00 ex GST committed + A$700.00 ex GST proposed = A$3,100.00 ex GST",
    );
    expect(r.reason).toContain("over the A$3,000.00 ex GST limit");
    expect(r.reason).toContain("[fictional teaching fixture]");
    expect(forms(plan, "A10").map((f) => f.recipientPartyId)).toEqual(["ins"]);
  });

  it("an unconfirmed payer is shown as unconfirmed, never as insurance paying", () => {
    expect(gate(plan, "L3", "PAYER").state).toBe("MISSING");
    expect(gate(plan, "L3", "PAYER").reason).toMatch(/payer not confirmed/);
  });

  it("sends separate strata drafts to the controller of each part", () => {
    const recipients = forms(plan, "A05")
      .map((f) => f.recipientPartyId)
      .sort();
    expect(recipients).toEqual(["lot", "sm"]);
    expect(forms(plan, "A08").map((f) => f.recipientPartyId)).toEqual(["ten"]);
    expect(forms(plan, "A09").map((f) => f.recipientPartyId)).toEqual(["lot"]);
  });

  it("nothing in the job can start yet", () => {
    expect(plan.scopes.every((s) => !s.canStart)).toBe(true);
  });
});

describe("fictional limit: restricted action under the limit still needs its own approval", () => {
  function underLimit(withApproval: boolean): AuthorityPlan {
    const job = nswStrataWaterLoss();
    job.caps[0].committed = { minor: 0, currency: "AUD", gst: "EX" };
    job.scope = job.scope.filter((l) => l.id === "L2");
    if (withApproval) {
      job.approvals.push({
        id: "r1",
        partyId: "ins",
        kind: "RESTRICTED_ACTION",
        scopeLineIds: ["L2"],
        evidence: "verified",
      });
    }
    return planAuthority(job);
  }

  it("A$100 of flooring removal is held without the insurer's separate written approval", () => {
    const r = gate(underLimit(false), "L2", "INSURER");
    expect(r.state).toBe("HOLD");
    expect(r.reason).toMatch(
      /flooring removal needs separate written approval/,
    );
    expect(r.reason).not.toMatch(/over the/);
  });

  it("the same line clears the insurer gate once that approval is verified", () => {
    expect(gate(underLimit(true), "L2", "INSURER").state).toBe("CLEAR");
  });

  it("exactly at the limit is within it; one cent over is not", () => {
    const at = nswStrataWaterLoss();
    at.scope = [at.scope[0]];
    at.caps[0].committed = { minor: 230_000, currency: "AUD", gst: "EX" };
    expect(gate(planAuthority(at), "L1", "INSURER").state).toBe("CLEAR");
    at.caps[0].committed = { minor: 230_001, currency: "AUD", gst: "EX" };
    expect(gate(planAuthority(at), "L1", "INSURER").state).toBe("HOLD");
  });
});

describe("funding rules that cannot be trusted hold the work", () => {
  function withCap(patch: (j: JobFacts) => void): {
    state: GateState;
    reason: string;
  } {
    const job = nswStrataWaterLoss();
    job.scope = [job.scope[0]];
    job.caps[0].committed = { minor: 0, currency: "AUD", gst: "EX" };
    patch(job);
    return gate(planAuthority(job), "L1", "INSURER");
  }

  it("unreviewed rule", () => {
    const r = withCap((j) => (j.caps[0].status = "UNREVIEWED"));
    expect(r.state).toBe("HOLD");
    expect(r.reason).toMatch(/unreviewed and is not applied/);
  });

  it("expired rule", () => {
    const r = withCap((j) => (j.caps[0].expiresOn = "2026-11-01"));
    expect(r.state).toBe("HOLD");
    expect(r.reason).toMatch(/expired/);
  });

  it("different GST basis is not compared", () => {
    const r = withCap(
      (j) =>
        (j.scope[0].amount = { minor: 70_000, currency: "AUD", gst: "INC" }),
    );
    expect(r.state).toBe("HOLD");
    expect(r.reason).toMatch(/not compared/);
  });

  it("different currency is not compared", () => {
    const r = withCap(
      (j) =>
        (j.scope[0].amount = { minor: 70_000, currency: "NZD", gst: "EX" }),
    );
    expect(r.state).toBe("HOLD");
  });

  it("no terms on file means no limit is assumed", () => {
    const r = withCap((j) => (j.caps = []));
    expect(r.state).toBe("HOLD");
    expect(r.reason).toMatch(/terms are not on file/);
  });
});

describe("case 2: QLD commercial, customer pays directly", () => {
  const plan = planAuthority(qldCommercialSelfPay());

  it("a site manager can grant access but cannot authorise the work", () => {
    expect(gate(plan, "C1", "ACCESS").state).toBe("CLEAR");
    expect(gate(plan, "C1", "WORK").state).toBe("MISSING");
    expect(gate(plan, "C1", "WORK").reason).toMatch(
      /Cafe Site Manager.*not control/,
    );
  });

  it("a requested deposit stays disabled", () => {
    expect(plan.deposit.requested).toBe(true);
    expect(plan.deposit.enabled).toBe(false);
  });

  it("drafts the commercial authority and direct-pay contract for the company signatory", () => {
    expect(forms(plan, "A07").map((f) => f.recipientPartyId)).toEqual(["dir"]);
    expect(forms(plan, "A03").map((f) => f.recipientPartyId)).toEqual(["dir"]);
  });

  it("prefills from the business profile and names the source of each value", () => {
    const a03 = forms(plan, "A03")[0];
    const legal = a03.fields.find((f) => f.key === "supplierLegalName");
    expect(legal).toEqual({
      key: "supplierLegalName",
      value: "Example Restoration Pty Ltd",
      source: "business.legalName",
    });
    expect(a03.fields.find((f) => f.key === "amount")?.value).toBe(
      "A$2,400.00 incl GST",
    );
    expect(a03.customerPreview).toMatch(
      /does not authorise any work outside the listed scope lines/,
    );
  });

  it("a blank business field stays blank with a reason and blocks sending", () => {
    const job = qldCommercialSelfPay();
    job.business = { ...job.business, businessNumber: null };
    const a03 = forms(planAuthority(job), "A03")[0];
    const f = a03.fields.find((x) => x.key === "supplierBusinessNumber");
    expect(f?.value).toBeNull();
    expect(f?.blankReason).toBe("not on the business profile");
    expect(a03.notSendableBecause).toContain(
      "supplierBusinessNumber: not on the business profile",
    );
  });
});

describe("case 3: NZ rental after a storm", () => {
  const plan = planAuthority(nzRentalNaturalHazard());

  it("an agent whose delegation is only reported cannot authorise building work", () => {
    expect(gate(plan, "N1", "WORK").state).not.toBe("CLEAR");
    expect(gate(plan, "N1", "WORK").reason).toMatch(
      /emergency basis|not verified/,
    );
  });

  it("logged notice attempts without a documented emergency basis mean hold", () => {
    expect(gate(plan, "N1", "ACCESS").state).toBe("HOLD");
    expect(gate(plan, "N1", "WORK").state).toBe("HOLD");
  });

  it("an emergency never covers strip-out", () => {
    expect(gate(plan, "N2", "DISPOSAL").state).toBe("HOLD");
    expect(gate(plan, "N2", "DISPOSAL").reason).toMatch(
      /does not cover removal/,
    );
  });

  it("documenting the emergency basis allows make-safe only, still not strip-out", () => {
    const job = nzRentalNaturalHazard();
    job.emergencyBasis = {
      documented: true,
      noticeAttemptsLogged: true,
      note: "Roof open, rain forecast",
    };
    const p = planAuthority(job);
    expect(gate(p, "N1", "WORK").state).toBe("CLEAR");
    expect(gate(p, "N1", "WORK").reason).toMatch(/make-safe only/);
    expect(gate(p, "N2", "WORK").state).not.toBe("CLEAR");
    expect(gate(p, "N2", "DISPOSAL").state).toBe("HOLD");
    // Payer is still unconfirmed, so even make-safe cannot be marked ready to start.
    expect(p.scopes.find((s) => s.scopeLineId === "N1")?.canStart).toBe(false);
  });

  it("the tenant is asked about their own goods only, with no default charge for the building", () => {
    const tenantForms = plan.forms.filter((f) => f.recipientPartyId === "tn");
    for (const f of tenantForms) expect(f.scopeLineIds).toEqual(["N3"]);
  });
});

describe("hazards, evidence holds and jurisdiction", () => {
  it("hazardous work is held until safety clearance; a signature is not clearance", () => {
    const job = qldCommercialSelfPay();
    job.scope[0].hazardous = true;
    job.approvals.push({
      id: "x",
      partyId: "dir",
      kind: "WORK",
      scopeLineIds: ["C1"],
      evidence: "verified",
    });
    expect(gate(planAuthority(job), "C1", "SAFETY").state).toBe("HOLD");
    job.safetyClearances.push({
      scopeLineId: "C1",
      evidence: "verified",
      evidenceRef: "clearance DOC-9",
    });
    expect(gate(planAuthority(job), "C1", "SAFETY").state).toBe("CLEAR");
  });

  it("material held as evidence cannot be discarded even with the owner's approval", () => {
    const job = nswStrataWaterLoss();
    job.assets[1].evidenceHold = true;
    job.approvals.push({
      id: "x",
      partyId: "lot",
      kind: "IRREVERSIBLE",
      scopeLineIds: ["L2"],
      evidence: "verified",
    });
    expect(gate(planAuthority(job), "L2", "DISPOSAL").state).toBe("HOLD");
  });

  it("a scope line naming an asset not on the job is held, not dropped silently", () => {
    const job = qldCommercialSelfPay();
    job.scope[0].assetId = "no-such-asset";
    const p = planAuthority(job);
    expect(p.holds).toContain(
      "scope line C1 names an asset that is not on the job",
    );
    expect(p.scopes.find((s) => s.scopeLineId === "C1")).toBeUndefined();
    expect(p.forms.every((f) => !f.scopeLineIds.includes("C1"))).toBe(true);
  });

  it("a payer id that is not a party on the job holds the payer gate", () => {
    const job = qldCommercialSelfPay();
    job.scope[0].payment.payerPartyId = "ghost";
    const r = gate(planAuthority(job), "C1", "PAYER");
    expect(r.state).toBe("HOLD");
    expect(r.reason).toBe("payer ghost is not a party on this job");
  });

  it("a funded line naming a missing asset still counts toward the funder's running total", () => {
    const job = nswStrataWaterLoss();
    job.caps[0].committed.minor = 230_000;
    const l1 = job.scope[0];
    job.scope = [
      {
        id: "M1",
        assetId: "missing",
        description: "Line with a missing asset",
        amount: { minor: 100_000, currency: "AUD", gst: "EX" },
        payment: { basis: "INSURER_WORK_ORDER", payerPartyId: "ins" },
      },
      l1,
    ];
    // 230,000 already used + 100,000 (M1) + 70,000 (L1) = 400,000, over the 300,000 limit.
    const r = gate(planAuthority(job), "L1", "INSURER");
    expect(r.state).toBe("HOLD");
    expect(r.reason).toContain("A$4,000.00 ex GST");
  });

  it("an unconfirmed payer never receives a payer-split form", () => {
    const job = nswStrataWaterLoss();
    job.scope[2].payment.payerPartyId = "asr"; // L3 stays UNCONFIRMED
    const a11 = forms(planAuthority(job), "A11");
    expect(a11.map((f) => f.recipientPartyId)).not.toContain("asr");
  });

  it("a self-pay payer who is not a party on the job receives no form", () => {
    const job = qldCommercialSelfPay();
    job.scope[0].payment.payerPartyId = "ghost";
    const plan = planAuthority(job);
    for (const code of ["A03", "A11"]) {
      expect(forms(plan, code).map((f) => f.recipientPartyId)).not.toContain(
        "ghost",
      );
    }
  });

  it("emergency strip-out cannot start even with every owner approval and a documented basis", () => {
    const job = nzRentalNaturalHazard();
    job.emergencyBasis = {
      documented: true,
      noticeAttemptsLogged: true,
      note: "documented",
    };
    job.scope[1].payment = { basis: "OWNER_DIRECT", payerPartyId: "ll" };
    for (const kind of ["ACCESS", "WORK", "PAYMENT", "IRREVERSIBLE"] as const) {
      job.approvals.push({
        id: `x-${kind}`,
        partyId: "ll",
        kind,
        scopeLineIds: ["N2"],
        evidence: "verified",
      });
    }
    const plan = planAuthority(job);
    expect(plan.scopes.find((x) => x.scopeLineId === "N2")?.canStart).toBe(
      false,
    );
    expect(gate(plan, "N2", "DISPOSAL").state).toBe("HOLD");
  });

  // Founder ruling 20/11/2026: rules 3 and 8 are read strictly.
  it("an emergency line with no documented basis holds even when the owner has signed", () => {
    const job = qldCommercialSelfPay();
    job.scope[0].emergency = true;
    job.emergencyBasis = undefined;
    for (const kind of ["WORK", "PAYMENT"] as const) {
      job.approvals.push({
        id: `x-${kind}`,
        partyId: "dir",
        kind,
        scopeLineIds: ["C1"],
        evidence: "verified",
      });
    }
    const plan = planAuthority(job);
    expect(gate(plan, "C1", "ACCESS").state).toBe("HOLD");
    expect(gate(plan, "C1", "WORK").state).toBe("HOLD");
    expect(plan.scopes.find((x) => x.scopeLineId === "C1")?.canStart).toBe(
      false,
    );
  });

  it("a payer-split form goes only to a party with proven spend authority, whatever the payment type", () => {
    const job = nswStrataWaterLoss();
    job.scope[2].payment = { basis: "OWNER_DIRECT", payerPartyId: "ten" };
    const a11 = forms(planAuthority(job), "A11");
    expect(a11.length).toBeGreaterThan(0);
    expect(a11.map((f) => f.recipientPartyId)).not.toContain("ten");
  });

  it("an owner id that is not a party on the job never counts as established control", () => {
    const job = qldCommercialSelfPay();
    job.assets[0].ownerPartyId = "ghost";
    job.approvals.push({ id: "g1", partyId: "ghost", kind: "WORK", scopeLineIds: ["C1"], evidence: "verified" });
    job.approvals.push({ id: "g2", partyId: "dir", kind: "PAYMENT", scopeLineIds: ["C1"], evidence: "verified" });
    const plan = planAuthority(job);
    expect(gate(plan, "C1", "WORK").state).not.toBe("CLEAR");
    expect(plan.scopes.find((x) => x.scopeLineId === "C1")?.canStart).toBe(false);
  });

  it("an emergency flag alone never covers work that is not a listed make-safe task", () => {
    const job = qldCommercialSelfPay();
    job.scope[0].description = "Rebuild damaged kitchen joinery";
    job.scope[0].emergency = true;
    job.emergencyBasis = { documented: true, noticeAttemptsLogged: true, note: "water loss" };
    job.approvals.push({ id: "p1", partyId: "dir", kind: "PAYMENT", scopeLineIds: ["C1"], evidence: "verified" });
    const plan = planAuthority(job);
    expect(gate(plan, "C1", "WORK").state).not.toBe("CLEAR");
    expect(plan.scopes.find((x) => x.scopeLineId === "C1")?.canStart).toBe(false);
  });

  it("a running total too large to add exactly holds the line", () => {
    const job = nswStrataWaterLoss();
    const big = 2 ** 53;
    job.caps[0].cap.minor = big;
    job.caps[0].committed.minor = big;
    job.scope = [{ ...job.scope[0], amount: { minor: 1, currency: "AUD", gst: "EX" } }];
    // Caught at entry: an unsafe limit stops the whole plan before the insurer gate.
    const plan = planAuthority(job);
    expect(plan.scopes).toEqual([]);
    expect(plan.holds.some((h) => h.includes("not usable"))).toBe(true);
  });

  it("an earlier insurer line on a different GST basis leaves later totals unknown, so they hold", () => {
    const job = nswStrataWaterLoss();
    job.caps[0].cap.minor = 15_000;
    job.caps[0].committed.minor = 0;
    job.caps[0].restrictedNeedsSeparateApproval = [];
    const l1 = job.scope[0];
    job.scope = [
      { ...l1, id: "G1", amount: { minor: 10_000, currency: "AUD", gst: "INC" } },
      { ...l1, id: "G2", amount: { minor: 10_000, currency: "AUD", gst: "EX" } },
    ];
    const plan = planAuthority(job);
    expect(gate(plan, "G1", "INSURER").state).toBe("HOLD");
    expect(gate(plan, "G2", "INSURER").state).toBe("HOLD");
  });

  it("an amount that is not a safe whole number of cents holds the line, whoever pays", () => {
    const job = qldCommercialSelfPay();
    job.scope[0].amount.minor = 2 ** 53;
    for (const kind of ["WORK", "PAYMENT"] as const) {
      job.approvals.push({ id: `u-${kind}`, partyId: "dir", kind, scopeLineIds: ["C1"], evidence: "verified" });
    }
    const plan = planAuthority(job);
    expect(plan.scopes.find((x) => x.scopeLineId === "C1")?.canStart ?? false).toBe(false);
    expect(plan.holds.some((h) => h.includes("C1"))).toBe(true);
  });

  describe("any unusable money value stops the whole plan before any gate or form", () => {
    const cases: Array<[string, (j: JobFacts) => void]> = [
      ["negative committed amount", (j) => { j.caps[0].committed.minor = -70_000; }],
      ["fractional line amount", (j) => { j.scope[0].amount.minor = 1.5; }],
      ["unsafe cap", (j) => { j.caps[0].cap.minor = 2 ** 53; }],
    ];
    it.each(cases)("%s", (_label, mutate) => {
      const job = nswStrataWaterLoss();
      mutate(job);
      let plan: AuthorityPlan | undefined;
      expect(() => { plan = planAuthority(job); }).not.toThrow();
      expect(plan?.forms).toEqual([]);
      expect(plan?.scopes.every((s) => !s.canStart)).toBe(true);
      expect(plan?.holds.some((h) => h.includes("not usable"))).toBe(true);
    });
  });

  it("a form total too large to add exactly is left blank, never thrown or rounded", () => {
    const job = qldCommercialSelfPay();
    job.scope[0].amount.minor = Number.MAX_SAFE_INTEGER;
    job.scope.push({ ...job.scope[0], id: "C2", amount: { ...job.scope[0].amount, minor: 1 } });
    expect(() => planAuthority(job)).not.toThrow();
  });

  it("no form is ever addressed to an owner who is not a party on the job", () => {
    const job = qldCommercialSelfPay();
    job.assets[0].ownerPartyId = "ghost";
    const plan = planAuthority(job);
    expect(plan.forms.map((f) => f.recipientPartyId)).not.toContain("ghost");
  });

  it("an asset with no established controller holds the work", () => {
    const job = nswStrataWaterLoss();
    job.assets[2].ownershipEvidence = "reported";
    expect(gate(planAuthority(job), "L3", "WORK").state).toBe("HOLD");
  });

  it("a job with no jurisdiction pack is held and nothing can start", () => {
    for (const j of ["UNKNOWN", "AU-VIC"] as const) {
      const job = qldCommercialSelfPay();
      job.jurisdiction = j;
      job.approvals.push({
        id: "x",
        partyId: "dir",
        kind: "WORK",
        scopeLineIds: ["C1"],
        evidence: "verified",
      });
      job.approvals.push({
        id: "y",
        partyId: "dir",
        kind: "PAYMENT",
        scopeLineIds: ["C1"],
        evidence: "verified",
      });
      const p = planAuthority(job);
      expect(p.previewAllowed).toBe(false);
      expect(p.holds[0]).toMatch(/No jurisdiction pack/);
      expect(p.scopes[0].canStart).toBe(false);
    }
  });

  it("a fully authorised line in an enabled jurisdiction can start (positive control)", () => {
    const job = qldCommercialSelfPay();
    job.approvals.push({
      id: "x",
      partyId: "dir",
      kind: "WORK",
      scopeLineIds: ["C1"],
      evidence: "verified",
    });
    job.approvals.push({
      id: "y",
      partyId: "dir",
      kind: "PAYMENT",
      scopeLineIds: ["C1"],
      evidence: "verified",
    });
    expect(planAuthority(job).scopes[0].canStart).toBe(true);
  });
});

describe("money", () => {
  it("formats integer minor units and refuses fractions", () => {
    expect(formatMoney({ minor: 310_000, currency: "AUD", gst: "EX" })).toBe(
      "A$3,100.00 ex GST",
    );
    expect(formatMoney({ minor: 5, currency: "NZD", gst: "INC" })).toBe(
      "NZ$0.05 incl GST",
    );
    expect(() =>
      formatMoney({ minor: 1.5, currency: "AUD", gst: "EX" }),
    ).toThrow();
  });
});
