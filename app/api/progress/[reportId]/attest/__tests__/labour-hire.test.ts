/**
 * RA-1763 — wires the RA-1388 labour-hire validator into the attest route.
 *
 * The route already accepted "LABOUR_HIRE_SELF" as an attestation type, but
 * never validated or persisted the 5 labour-hire-specific fields. This suite
 * pins the new behaviour:
 *
 *   - validator runs only for "LABOUR_HIRE_SELF"
 *   - validator runs BEFORE consent-token redemption (so an invalid body
 *     doesn't burn a one-shot token)
 *   - normalised values land on the ProgressAttestation row
 *   - other attestation types are unaffected
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── mocks ──────────────────────────────────────────────────────────────────

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({
  validateCsrf: vi.fn(() => null), // not blocked by CSRF
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      req: Request,
      _userId: string,
      fn: (raw: string) => Promise<Response>,
    ) => {
      const raw = await req.text();
      return fn(raw);
    },
  ),
}));
vi.mock("@/lib/progress/permissions", () => ({
  canAttest: vi.fn(() => true),
  resolveProgressRole: vi.fn(() => "TECHNICIAN"),
}));
vi.mock("@/lib/progress/signature", () => ({
  validateSignatureDataUrl: vi.fn(() => ({
    ok: true,
    mimeType: "image/png",
    sizeBytes: 1024,
  })),
  computeAttestationIntegrityHash: vi.fn(() => "test-integrity-hash"),
}));
vi.mock("@/lib/telemetry/progress", () => ({
  recordAttestationCaptured: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({
  reportError: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimProgress: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    progressTransition: { findUnique: vi.fn() },
    attestationConsentToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    progressAttestation: { create: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        attestationConsentToken: {
          updateMany: vi.fn(async () => ({ count: 1 })),
        },
        progressAttestation: {
          create: vi.fn(async (args: unknown) => ({
            id: "att_1",
            attestationType: (args as { data: { attestationType: string } })
              .data.attestationType,
            attestedAt: new Date(),
            integrityHash: "test-integrity-hash",
          })),
        },
      }),
    ),
  },
}));

// ─── imports (after mocks) ──────────────────────────────────────────────────

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimProgress: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
  attestationConsentToken: {
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  progressAttestation: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

// ─── helpers ────────────────────────────────────────────────────────────────

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/progress/r1/attest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_LABOUR_HIRE_BODY = {
  attestationType: "LABOUR_HIRE_SELF",
  consentToken: "ct_abcdefghij",
  signatureDataUrl: "data:image/png;base64,AAAA",
  labourHireHours: 8,
  labourHireAwardClass: "Cleaning Services Award - Level 2",
  labourHireSuperRate: 0.12,
  labourHirePortableLslState: "nsw", // lowercase — validator upper-cases
  labourHireInductionEvidenceId: "evid_abc123",
};

function happyPathSetup(opts: { ctxConsumed?: boolean } = {}) {
  mockSession.mockResolvedValue({
    user: { id: "u_1", name: "Test User", email: "u@test.com", role: "USER" },
  });
  p.claimProgress.findUnique.mockResolvedValue({
    id: "cp_1",
    currentState: "AWAITING_TECHNICIAN_SIGN_OFF",
  });
  p.user.findUnique.mockResolvedValue({
    email: "u@test.com",
    name: "Test User",
    isJuniorTechnician: false,
  });
  p.attestationConsentToken.findUnique.mockResolvedValue({
    id: "ct_abcdefghij",
    userId: "u_1",
    reportId: "r1",
    attestationType: "LABOUR_HIRE_SELF",
    consumedAt: opts.ctxConsumed ? new Date() : null,
    expiresAt: new Date(Date.now() + 60_000),
    contentHash: "ch_test",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Re-set the $transaction default to a working stub each time so we can
  // override it per-test (e.g. assert it wasn't called on validation fail).
  p.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      attestationConsentToken: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      progressAttestation: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: "att_1",
          ...args.data,
        })),
      },
    }),
  );
});

// ─── tests ──────────────────────────────────────────────────────────────────

describe("RA-1763 — labour-hire validator wired into attest route", () => {
  it("persists normalised labour-hire fields on a valid LABOUR_HIRE_SELF body", async () => {
    happyPathSetup();
    const created = vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: "att_1",
      ...args.data,
    }));
    p.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        attestationConsentToken: {
          updateMany: vi.fn(async () => ({ count: 1 })),
        },
        progressAttestation: { create: created },
      }),
    );

    const res = await POST(makePost(VALID_LABOUR_HIRE_BODY), {
      params: Promise.resolve({ reportId: "r1" }),
    });

    expect(res.status).toBe(200);
    expect(created).toHaveBeenCalledTimes(1);
    const data = (created.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data.labourHireHours).toBe(8);
    expect(data.labourHireAwardClass).toBe("Cleaning Services Award - Level 2");
    expect(data.labourHireSuperRate).toBe(0.12);
    expect(data.labourHirePortableLslState).toBe("NSW"); // upper-cased
    expect(data.labourHireInductionEvidenceId).toBe("evid_abc123");
  });

  it("returns 400 with field-keyed errors when hours is invalid", async () => {
    happyPathSetup();
    const res = await POST(
      makePost({ ...VALID_LABOUR_HIRE_BODY, labourHireHours: -5 }),
      { params: Promise.resolve({ reportId: "r1" }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION");
    expect(json.error.fields.hours).toMatch(/OUT_OF_RANGE/);
  });

  it("returns 400 when superRate < 0.12 (Super Guarantee minimum)", async () => {
    happyPathSetup();
    const res = await POST(
      makePost({ ...VALID_LABOUR_HIRE_BODY, labourHireSuperRate: 0.11 }),
      { params: Promise.resolve({ reportId: "r1" }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.fields.superRate).toMatch(/BELOW_SG_MIN/);
  });

  it("returns 400 when portableLslState is not in the allowed set", async () => {
    happyPathSetup();
    const res = await POST(
      makePost({ ...VALID_LABOUR_HIRE_BODY, labourHirePortableLslState: "WA" }),
      { params: Promise.resolve({ reportId: "r1" }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.fields.portableLslState).toMatch(/INVALID_STATE/);
  });

  it("does NOT redeem the consent token on validation failure", async () => {
    happyPathSetup();
    const res = await POST(
      makePost({ ...VALID_LABOUR_HIRE_BODY, labourHireHours: undefined }),
      { params: Promise.resolve({ reportId: "r1" }) },
    );

    expect(res.status).toBe(400);
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(p.attestationConsentToken.updateMany).not.toHaveBeenCalled();
  });

  it("does NOT call progressAttestation.create on validation failure", async () => {
    happyPathSetup();
    const created = vi.fn();
    p.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        attestationConsentToken: {
          updateMany: vi.fn(async () => ({ count: 1 })),
        },
        progressAttestation: { create: created },
      }),
    );

    await POST(
      makePost({
        ...VALID_LABOUR_HIRE_BODY,
        labourHireInductionEvidenceId: "",
      }),
      { params: Promise.resolve({ reportId: "r1" }) },
    );

    expect(created).not.toHaveBeenCalled();
  });

  it("non-LABOUR_HIRE_SELF body skips the labour-hire validator and persists nulls in the 5 fields", async () => {
    mockSession.mockResolvedValue({
      user: { id: "u_1", name: "Test", email: "u@test.com", role: "USER" },
    });
    p.claimProgress.findUnique.mockResolvedValue({
      id: "cp_1",
      currentState: "AWAITING_TECHNICIAN_SIGN_OFF",
    });
    p.user.findUnique.mockResolvedValue({
      email: "u@test.com",
      name: "Test",
      isJuniorTechnician: false,
    });
    p.attestationConsentToken.findUnique.mockResolvedValue({
      id: "ct_abcdefghij",
      userId: "u_1",
      reportId: "r1",
      attestationType: "TECHNICIAN_SIGN_OFF",
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      contentHash: "ch_test",
    });
    const created = vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: "att_2",
      ...args.data,
    }));
    p.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        attestationConsentToken: {
          updateMany: vi.fn(async () => ({ count: 1 })),
        },
        progressAttestation: { create: created },
      }),
    );

    const res = await POST(
      makePost({
        attestationType: "TECHNICIAN_SIGN_OFF",
        consentToken: "ct_abcdefghij",
        signatureDataUrl: "data:image/png;base64,AAAA",
        // No labour-hire fields supplied — must NOT fail validation.
      }),
      { params: Promise.resolve({ reportId: "r1" }) },
    );

    expect(res.status).toBe(200);
    expect(created).toHaveBeenCalledTimes(1);
    const data = (created.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(data.labourHireHours).toBeNull();
    expect(data.labourHireAwardClass).toBeNull();
    expect(data.labourHireSuperRate).toBeNull();
    expect(data.labourHirePortableLslState).toBeNull();
    expect(data.labourHireInductionEvidenceId).toBeNull();
  });

  it("aggregates multiple field errors in a single 400 response", async () => {
    happyPathSetup();
    const res = await POST(
      makePost({
        attestationType: "LABOUR_HIRE_SELF",
        consentToken: "ct_abcdefghij",
        signatureDataUrl: "data:image/png;base64,AAAA",
        // No labour-hire fields at all → expect MISSING errors on multiple
      }),
      { params: Promise.resolve({ reportId: "r1" }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION");
    expect(json.error.fields.hours).toMatch(/MISSING/);
    expect(json.error.fields.awardClass).toMatch(/MISSING/);
    expect(json.error.fields.superRate).toMatch(/MISSING/);
    expect(json.error.fields.inductionEvidenceId).toMatch(/MISSING/);
  });
});
