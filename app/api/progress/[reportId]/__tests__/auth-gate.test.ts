/**
 * RA-6790 — prod log-noise gate.
 *
 * An unauthenticated POST to the progress attestation routes must return 401
 * BEFORE any Prisma access. Previously a stray query on the unauthenticated
 * path emitted a `prisma:error` on every blocked call, polluting prod logs
 * (the response was correct — 401 — but the noise tripped the deploy/health
 * audit). These tests pin the invariant: when `getServerSession` resolves to
 * no session, the handler 401s and never touches the database.
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
  computeContentHash: vi.fn(() => "ch_test"),
}));
vi.mock("@/lib/telemetry/progress", () => ({
  recordAttestationCaptured: vi.fn(),
}));

// Every prisma model method used by the three routes. If the unauthenticated
// path is correctly gated, NONE of these is ever invoked.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { findUnique: vi.fn() },
    claimProgress: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    progressTransition: { findUnique: vi.fn() },
    attestationConsentToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    progressAttestation: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// ─── imports (after mocks) ──────────────────────────────────────────────────

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST as transitionPOST } from "../transition/route";
import { POST as preAttestPOST } from "../pre-attest/route";
import { POST as attestPOST } from "../attest/route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

/** Flatten every mocked prisma method into a single array for assertion. */
function allPrismaMethods(): Array<ReturnType<typeof vi.fn>> {
  const p = prisma as unknown as Record<
    string,
    Record<string, unknown> | ReturnType<typeof vi.fn>
  >;
  const fns: Array<ReturnType<typeof vi.fn>> = [];
  for (const value of Object.values(p)) {
    if (typeof value === "function") {
      fns.push(value as ReturnType<typeof vi.fn>);
    } else if (value && typeof value === "object") {
      for (const method of Object.values(value)) {
        if (typeof method === "function") {
          fns.push(method as ReturnType<typeof vi.fn>);
        }
      }
    }
  }
  return fns;
}

function makePost(path: string, body: object): NextRequest {
  return new NextRequest(`http://localhost/api/progress/r1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ reportId: "r1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  // Unauthenticated: no session.
  mockSession.mockResolvedValue(null);
});

describe("progress attestation routes — unauthenticated POST", () => {
  const cases: Array<{
    name: string;
    handler: (req: NextRequest, ctx: typeof ctx) => Promise<Response>;
    path: string;
    body: object;
  }> = [
    {
      name: "transition",
      handler: transitionPOST,
      path: "transition",
      body: { key: "SUBMIT" },
    },
    {
      name: "pre-attest",
      handler: preAttestPOST,
      path: "pre-attest",
      body: {
        attestationType: "TECHNICIAN_SIGN_OFF",
        contentSummary: "I have read and agree to sign this report.",
        consentAcknowledged: true,
      },
    },
    {
      name: "attest",
      handler: attestPOST,
      path: "attest",
      body: {
        attestationType: "TECHNICIAN_SIGN_OFF",
        consentToken: "ct_abcdefghij",
        signatureDataUrl: "data:image/png;base64,AAAA",
      },
    },
  ];

  for (const tc of cases) {
    it(`${tc.name}: returns 401 without touching prisma`, async () => {
      const res = await tc.handler(makePost(tc.path, tc.body), ctx);

      expect(res.status).toBe(401);

      // The load-noise invariant: zero prisma calls on the blocked path.
      for (const fn of allPrismaMethods()) {
        expect(fn).not.toHaveBeenCalled();
      }
    });
  }
});
