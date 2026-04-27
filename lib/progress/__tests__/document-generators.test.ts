import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      claimProgress: { findUnique: vi.fn() },
      progressTransition: { findMany: vi.fn() },
      progressAttestation: { findMany: vi.fn() },
    },
  };
});

import { prisma } from "@/lib/prisma";
import {
  generateCarrierPacketPdf,
  generateCloseoutPack,
  generateLabourHireSummary,
  generateStabilisationCertificate,
  loadClaimDataGraph,
  type ClaimDataGraph,
} from "../document-generators";

const cpFindUnique = (prisma as unknown as {
  claimProgress: { findUnique: ReturnType<typeof vi.fn> };
}).claimProgress.findUnique;
const trFindMany = (prisma as unknown as {
  progressTransition: { findMany: ReturnType<typeof vi.fn> };
}).progressTransition.findMany;
const atFindMany = (prisma as unknown as {
  progressAttestation: { findMany: ReturnType<typeof vi.fn> };
}).progressAttestation.findMany;

beforeEach(() => {
  vi.clearAllMocks();
});

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

function fakeGraph(
  overrides: Partial<ClaimDataGraph> = {},
): ClaimDataGraph {
  return {
    claimProgress: {
      id: "cp_1",
      reportId: "r_1",
      currentState: "STABILISATION_COMPLETE",
      version: 2,
      closedAt: null,
      createdAt: new Date("2026-04-25T09:00:00Z"),
    },
    report: {
      id: "r_1",
      title: "12 Smith St — Cat 2 water",
      clientName: "Jane Owner",
      propertyAddress: "12 Smith St, Brisbane QLD 4000",
      hazardType: "WATER_CAT_2",
      insuranceType: "RESIDENTIAL_BUILDING",
    },
    transitions: [
      {
        id: "tr_start",
        transitionKey: "start_stabilisation",
        fromState: "INTAKE",
        toState: "STABILISATION_ACTIVE",
        actorName: "Alex Tech",
        actorRole: "TECHNICIAN",
        transitionedAt: new Date("2026-04-25T10:00:00Z"),
        integrityHash: "h" + "a".repeat(63),
        softGaps: [],
        auditGaps: [],
      },
      {
        id: "tr_attest",
        transitionKey: "attest_stabilisation",
        fromState: "STABILISATION_ACTIVE",
        toState: "STABILISATION_COMPLETE",
        actorName: "Alex Tech",
        actorRole: "TECHNICIAN",
        transitionedAt: new Date("2026-04-26T08:00:00Z"),
        integrityHash: "h" + "b".repeat(63),
        softGaps: ["evidence.photo.coverage"],
        auditGaps: [],
      },
    ],
    attestations: [
      {
        id: "at_1",
        attestationType: "TECHNICIAN_SIGN_OFF",
        attestorName: "Alex Tech",
        attestorRole: "TECHNICIAN",
        attestorEmail: "alex@example.com",
        attestedAt: new Date("2026-04-26T08:00:00Z"),
        integrityHash: "h" + "c".repeat(63),
        signatureDataUrl: TINY_PNG_DATA_URL,
        labourHireHours: null,
        labourHireAwardClass: null,
        labourHireSuperRate: null,
        labourHirePortableLslState: null,
        labourHireInductionEvidenceId: null,
        transitionId: "tr_attest",
      },
    ],
    ...overrides,
  };
}

// ─── loader ──────────────────────────────────────────────────────────────────

describe("loadClaimDataGraph", () => {
  it("returns ok:false when ClaimProgress is missing", async () => {
    cpFindUnique.mockResolvedValueOnce(null);

    const r = await loadClaimDataGraph("r_missing");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/not found/i);
  });

  it("aggregates ClaimProgress + Report + transitions + attestations", async () => {
    cpFindUnique.mockResolvedValueOnce({
      id: "cp_1",
      reportId: "r_1",
      currentState: "STABILISATION_COMPLETE",
      version: 2,
      closedAt: null,
      createdAt: new Date("2026-04-25T09:00:00Z"),
      report: {
        id: "r_1",
        title: "x",
        clientName: "y",
        propertyAddress: "z",
        hazardType: "h",
        insuranceType: "i",
      },
    });
    trFindMany.mockResolvedValueOnce([
      {
        id: "tr_1",
        transitionKey: "start_stabilisation",
        fromState: "INTAKE",
        toState: "STABILISATION_ACTIVE",
        actorName: "A",
        actorRole: "TECHNICIAN",
        transitionedAt: new Date("2026-04-25T10:00:00Z"),
        integrityHash: "x",
        softGaps: ["evidence.photo.coverage"],
        auditGaps: null,
      },
    ]);
    atFindMany.mockResolvedValueOnce([
      {
        id: "at_1",
        attestationType: "LABOUR_HIRE_SELF",
        attestorName: "B",
        attestorRole: "LABOUR_HIRE",
        attestorEmail: "b@e.co",
        attestedAt: new Date("2026-04-26T08:00:00Z"),
        integrityHash: "y",
        signatureDataUrl: null,
        labourHireHours: { toString: () => "7.5" } as unknown as number,
        labourHireAwardClass: "Cleaning Award",
        labourHireSuperRate: { toString: () => "0.12" } as unknown as number,
        labourHirePortableLslState: "QLD",
        labourHireInductionEvidenceId: "ev_1",
        transitionId: null,
      },
    ]);

    const r = await loadClaimDataGraph("r_1");

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.transitions).toHaveLength(1);
    expect(r.data.transitions[0].softGaps).toEqual([
      "evidence.photo.coverage",
    ]);
    expect(r.data.transitions[0].auditGaps).toEqual([]);
    expect(r.data.attestations[0].labourHireHours).toBeCloseTo(7.5);
    expect(r.data.attestations[0].labourHireSuperRate).toBeCloseTo(0.12);
  });
});

// ─── generators (smoke: produce a non-empty PDF) ────────────────────────────

describe("PDF generators — smoke", () => {
  it("generateStabilisationCertificate produces a valid PDF byte stream", async () => {
    const bytes = await generateStabilisationCertificate(fakeGraph());
    expect(bytes.length).toBeGreaterThan(500);
    // PDFs start with "%PDF-"
    expect(Buffer.from(bytes).slice(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("generateLabourHireSummary handles zero labour-hire attestations", async () => {
    const bytes = await generateLabourHireSummary(fakeGraph());
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes).slice(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("generateLabourHireSummary populates a labour-hire row when present", async () => {
    const graph = fakeGraph({
      attestations: [
        {
          id: "at_lh",
          attestationType: "LABOUR_HIRE_SELF",
          attestorName: "Sub Worker",
          attestorRole: "LABOUR_HIRE",
          attestorEmail: "sub@example.com",
          attestedAt: new Date("2026-04-26T11:00:00Z"),
          integrityHash: "h" + "1".repeat(63),
          signatureDataUrl: TINY_PNG_DATA_URL,
          labourHireHours: 8,
          labourHireAwardClass: "Cleaning Services Award 2020 — Level 4",
          labourHireSuperRate: 0.12,
          labourHirePortableLslState: "QLD",
          labourHireInductionEvidenceId: "ev_induction_42",
          transitionId: null,
        },
      ],
    });
    const bytes = await generateLabourHireSummary(graph);
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("generateCarrierPacketPdf renders even when stabilisation has not occurred", async () => {
    const graph = fakeGraph({
      transitions: [],
      attestations: [],
      claimProgress: {
        id: "cp_1",
        reportId: "r_1",
        currentState: "INTAKE",
        version: 0,
        closedAt: null,
        createdAt: new Date(),
      },
    });
    const bytes = await generateCarrierPacketPdf(graph);
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("generateCloseoutPack assembles transitions + attestations chronologically", async () => {
    const bytes = await generateCloseoutPack(fakeGraph());
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes).slice(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("generators do not throw when signature is missing", async () => {
    const graph = fakeGraph({
      attestations: fakeGraph().attestations.map((a) => ({
        ...a,
        signatureDataUrl: null,
      })),
    });
    await expect(
      generateStabilisationCertificate(graph),
    ).resolves.toBeInstanceOf(Uint8Array);
    await expect(generateCloseoutPack(graph)).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });

  it("generators do not throw on SVG signatures (gracefully fall back to caption)", async () => {
    const graph = fakeGraph({
      attestations: fakeGraph().attestations.map((a) => ({
        ...a,
        signatureDataUrl:
          "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
      })),
    });
    await expect(
      generateStabilisationCertificate(graph),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
