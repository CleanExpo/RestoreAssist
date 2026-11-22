import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";
import {
  HANDOFF_NOTICE,
  POST_REMEDIATION_VERIFICATION_SCOPE,
  buildVerificationHandoff,
  isUniversalSporeThreshold,
  verificationHandoffRows,
  type IndependentReviewerRecord,
  type VerificationHandoffInput,
} from "../independent-verification-handoff";

const RESTORER_ORG = "org-restorer";
const RESTORER_USER = "user-tech";

const LAB = {
  labName: "Harbour Test Laboratory",
  labReportReference: "HTL-2026-0457",
  samplingDate: "2026-11-10T00:00:00.000Z",
  clearanceCriterion: "Indoor below outdoor baseline, same genera",
};

const ASSESSOR: IndependentReviewerRecord = {
  name: "Dana Hughes",
  organisationName: "Southern Hygiene Consulting",
  organisationId: "org-hygiene",
  userId: "user-dana",
  role: "occupational_hygienist",
  scope: [POST_REMEDIATION_VERIFICATION_SCOPE],
  identityCheck: {
    checkedByUserId: "user-office",
    method: "professional body membership register",
    checkedAt: "2026-11-09T00:00:00.000Z",
  },
  inspectionDate: "2026-11-11T00:00:00.000Z",
  samplingMethod: "Spore trap air sampling, indoor and outdoor",
  reportReference: "SHC-PRV-1182",
  signedOffAt: "2026-11-14T00:00:00.000Z",
};

function input(over: Partial<VerificationHandoffInput> = {}): VerificationHandoffInput {
  return {
    tenancy: { viewerOrganizationId: RESTORER_ORG, jobOrganizationId: RESTORER_ORG },
    restorer: { organizationId: RESTORER_ORG, userIds: [RESTORER_USER] },
    assessment: LAB,
    reviewer: ASSESSOR,
    ...over,
  };
}

function ok(i: VerificationHandoffInput) {
  const h = buildVerificationHandoff(i);
  if (!h.ok) throw new Error(`expected ok, got ${h.reason}`);
  return h;
}

const item = (h: ReturnType<typeof ok>, key: string) => {
  const found = h.items.find((i) => i.key === key);
  if (!found) throw new Error(`no item ${key}`);
  return found;
};

const BANNED = /\b(safe|cleared?|clearance passed|pass(ed)?|fail(ed)?|certified|mould[- ]free|health risk)\b/i;

describe("independent verification handoff (RA-8373)", () => {
  it("records an independent, properly scoped assessor without certifying the outcome", () => {
    const h = ok(input());
    expect(h.status).toBe("independent_record_supplied");
    expect(h.items.filter((i) => i.outstanding)).toEqual([]);
    expect(item(h, "decision_owner").value).toBe("Dana Hughes, Southern Hygiene Consulting");
    expect(item(h, "signoff").value).toContain("SHC-PRV-1182");
    expect(item(h, "signoff").basis).toBe("source");
    const all = verificationHandoffRows(h).map(([, v]) => v).join(" ");
    expect(all).not.toMatch(BANNED);
  });

  it("fails on missing reviewer scope", () => {
    const h = ok(input({ reviewer: { ...ASSESSOR, scope: [] } }));
    expect(h.status).toBe("independent_review_outstanding");
    expect(item(h, "role_scope").outstanding).toBe(true);
    expect(item(h, "role_scope").value).toMatch(/scope does not include post-remediation verification/);
  });

  it("fails on a role that is not an independent professional", () => {
    const h = ok(input({ reviewer: { ...ASSESSOR, role: "restoration_technician" } }));
    expect(item(h, "role_scope").outstanding).toBe(true);
    expect(item(h, "decision_owner").outstanding).toBe(true);
  });

  it("fails on a false or self-attested review identity", () => {
    const self = ok(
      input({
        reviewer: {
          ...ASSESSOR,
          identityCheck: { checkedByUserId: "user-dana", method: "said so" },
        },
      }),
    );
    expect(self.status).toBe("independent_review_outstanding");
    expect(item(self, "identity").value).toMatch(/Self-attested/);
    expect(item(self, "identity").basis).toBe("unverified");

    const none = ok(input({ reviewer: { ...ASSESSOR, identityCheck: null } }));
    expect(item(none, "identity").outstanding).toBe(true);
    expect(item(none, "signoff").basis).toBe("unverified");
  });

  it("refuses restorer self-certification, by user or by organisation", () => {
    const byUser = ok(input({ reviewer: { ...ASSESSOR, userId: RESTORER_USER, identityCheck: { checkedByUserId: "user-office", method: "register" } } }));
    expect(byUser.status).toBe("independent_review_outstanding");
    expect(item(byUser, "independence").value).toMatch(/restorer cannot self-certify/);
    expect(item(byUser, "decision_owner").outstanding).toBe(true);

    const byOrg = ok(input({ reviewer: { ...ASSESSOR, organisationId: RESTORER_ORG } }));
    expect(item(byOrg, "independence").outstanding).toBe(true);
  });

  it("fails on an unsupported universal spore threshold", () => {
    const h = ok(
      input({
        assessment: { ...LAB, clearanceCriterion: "< 500 spores/m3" },
        reviewer: { ...ASSESSOR, reportReference: null },
      }),
    );
    expect(item(h, "criterion").outstanding).toBe(true);
    expect(item(h, "criterion").value).toMatch(/does not apply one figure to every job/);
  });

  it("accepts a numeric criterion only when the independent report backs it", () => {
    const h = ok(input({ assessment: { ...LAB, clearanceCriterion: "≤ 500 spores/m3" } }));
    expect(item(h, "criterion").outstanding).toBe(false);
    expect(item(h, "criterion").value).toBe("As set in independent report SHC-PRV-1182");
  });

  it("classifies universal thresholds narrowly", () => {
    expect(isUniversalSporeThreshold("500 spores/m3")).toBe(true);
    expect(isUniversalSporeThreshold("below 1,000 spores per m³")).toBe(true);
    expect(isUniversalSporeThreshold("Indoor below outdoor baseline")).toBe(false);
    expect(isUniversalSporeThreshold("< 500 spores/m3 and below outdoor")).toBe(false);
    expect(isUniversalSporeThreshold("")).toBe(false);
  });

  it("fails on missing lab details and names each one", () => {
    const h = ok(input({ assessment: { clearanceCriterion: LAB.clearanceCriterion } }));
    expect(item(h, "laboratory").outstanding).toBe(true);
    expect(item(h, "laboratory").value).toBe(
      "Missing: laboratory name, lab report reference, sampling date",
    );
  });

  it("returns nothing to a user from another tenancy", () => {
    expect(
      buildVerificationHandoff(
        input({ tenancy: { viewerOrganizationId: "org-other", jobOrganizationId: RESTORER_ORG } }),
      ),
    ).toEqual({ ok: false, reason: "other_tenancy" });
    expect(
      buildVerificationHandoff(
        input({ tenancy: { viewerOrganizationId: null, jobOrganizationId: RESTORER_ORG } }),
      ).ok,
    ).toBe(false);
  });

  it("treats a missing reviewer as outstanding, never as passed", () => {
    const h = ok(input({ reviewer: null }));
    expect(h.status).toBe("independent_review_outstanding");
    expect(item(h, "decision_owner").value).toMatch(/belongs to an independent professional/);
    expect(h.unresolved.length).toBeGreaterThan(5);
  });

  it("withholds disease, occupancy and condition wording from free text", () => {
    const h = ok(
      input({
        assessment: { ...LAB, clearanceCriterion: "Area is safe to reoccupy for asthma sufferers" },
        reviewer: { ...ASSESSOR, notes: "No health risk" },
        evidenceExceptions: ["Ceiling void not opened", "Mould-free behind vanity"],
      }),
    );
    expect(h.withheldWordingCount).toBeGreaterThan(0);
    const all = [...verificationHandoffRows(h).map(([, v]) => v), ...h.unresolved].join(" ");
    expect(all).not.toMatch(/\b(safe|asthma|reoccupy|health risk|mould-free)\b/i);
    expect(all).toContain("Ceiling void not opened");
  });

  it("labels every row with SOURCE, INFERRED or UNVERIFIED", () => {
    const rows = verificationHandoffRows(ok(input({ reviewer: null })));
    for (const [label, value] of rows.slice(1)) {
      expect(value, label).toMatch(/^\[(SOURCE|INFERRED|UNVERIFIED)\] /);
    }
  });
});

async function pdfText(data: Parameters<typeof generateIICRCReportPDF>[0]): Promise<string> {
  const bytes = await generateIICRCReportPDF(data, {});
  const parser = new PDFParse({ data: bytes });
  return (await parser.getText()).text;
}

describe("report PDF section 6B (RA-8373 acceptance)", () => {
  it("keeps uncertainties and the lab report reference on a mould job", async () => {
    const text = await pdfText({
      id: "handoff-fixture",
      claimType: "MOULD",
      mouldAssessment: LAB,
    });
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("Independent verification handoff");
    expect(flat).toContain("Independent review outstanding");
    expect(flat).toContain("HTL-2026-0457");
    expect(flat).toContain("[UNVERIFIED]");
    expect(flat).toContain(HANDOFF_NOTICE.slice(0, 60));
  }, 30_000);

  it("does not print the handoff on a water job", async () => {
    const text = await pdfText({ id: "water-fixture", claimType: "WATER" });
    expect(text).not.toContain("Independent verification handoff");
  }, 30_000);
});
