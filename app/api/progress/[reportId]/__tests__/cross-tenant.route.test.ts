/**
 * RA-7628 — another business's admin must not reach a claim's progress.
 *
 * Every firm that self-registers is given `role: "ADMIN"` over its own account
 * (app/api/auth/register/route.ts), so "ADMIN" means "owner of this business",
 * never "RestoreAssist staff". The claim-progress routes treated it as a global
 * bypass: an admin of business A could read, advance, bootstrap, sign and
 * export business B's claim by its report id.
 *
 * For each of the six routes this suite pins:
 *   (a) an ADMIN of another organisation            → 404, nothing reached
 *   (b) an ADMIN of the report owner's organisation → admitted
 *   (c) an allowlisted platform-support operator    → admitted
 *   (d) that same operator with the allowlist unset → 404 (fails closed)
 *
 * The REAL `assertReportTenancy` runs here against a mocked prisma, so the
 * organisation comparison itself is under test — nothing mocks the gate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ─── mocks ──────────────────────────────────────────────────────────────────

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      req: Request,
      _userId: string,
      fn: (raw: string) => Promise<Response>,
    ) => fn(await req.text()),
  ),
}));

// The service's read/write work is stubbed; its ownership check is NOT — the
// attest and pre-attest routes have called it directly, so the real rule
// decides there.
const getState = vi.fn();
const transition = vi.fn();
const init = vi.fn();
vi.mock("@/lib/progress/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/progress/service")>()),
  getState: (...a: unknown[]) => getState(...a),
  transition: (...a: unknown[]) => transition(...a),
  init: (...a: unknown[]) => init(...a),
}));
vi.mock("@/lib/telemetry/progress", () => ({
  recordAttestationCaptured: vi.fn(),
  recordEvidenceMissing: vi.fn(),
  recordTransitionAttempt: vi.fn(),
  recordTransitionBlocked: vi.fn(),
  recordTransitionSuccess: vi.fn(),
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
const loadClaimDataGraph = vi.fn();
vi.mock("@/lib/progress/document-generators", () => ({
  generateCarrierPacketPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
  generateCloseoutPack: vi.fn(async () => new Uint8Array([1, 2, 3])),
  generateLabourHireSummary: vi.fn(async () => new Uint8Array([1, 2, 3])),
  generateStabilisationCertificate: vi.fn(
    async () => new Uint8Array([1, 2, 3]),
  ),
  loadClaimDataGraph: (...a: unknown[]) => loadClaimDataGraph(...a),
}));

const userFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const claimProgressFindUnique = vi.fn();
const tokenFindUnique = vi.fn();
const tokenCreate = vi.fn();
const $transaction = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    report: { findUnique: (...a: unknown[]) => reportFindUnique(...a) },
    claimProgress: {
      findUnique: (...a: unknown[]) => claimProgressFindUnique(...a),
    },
    progressTransition: { findUnique: vi.fn() },
    attestationConsentToken: {
      findUnique: (...a: unknown[]) => tokenFindUnique(...a),
      create: (...a: unknown[]) => tokenCreate(...a),
    },
    $transaction: (...a: unknown[]) => $transaction(...a),
  },
}));

// ─── imports (after mocks) ──────────────────────────────────────────────────

import { GET as readGET } from "../route";
import { POST as transitionPOST } from "../transition/route";
import { POST as initPOST } from "../init/route";
import { POST as attestPOST } from "../attest/route";
import { POST as preAttestPOST } from "../pre-attest/route";
import { GET as documentsGET } from "../documents/[type]/route";

// ─── fixtures ───────────────────────────────────────────────────────────────

const REPORT_ID = "r_business_b";
const ORG_A = "org_business_a";
const ORG_B = "org_business_b";

/** Business B's claim: owned by B's own user, inside organisation B. */
const REPORT = {
  id: REPORT_ID,
  userId: "u_owner_b",
  user: { organizationId: ORG_B },
};

/** Database truth for every caller. The JWT says ADMIN for all of them. */
const USERS: Record<
  string,
  {
    id: string;
    role: string;
    organizationId: string | null;
    isJuniorTechnician: boolean;
    email: string;
    name: string;
  }
> = {
  u_admin_a: {
    id: "u_admin_a",
    role: "ADMIN",
    organizationId: ORG_A,
    isJuniorTechnician: false,
    email: "admin@a.test",
    name: "Admin of A",
  },
  u_admin_b: {
    id: "u_admin_b",
    role: "ADMIN",
    organizationId: ORG_B,
    isJuniorTechnician: false,
    email: "admin@b.test",
    name: "Admin of B",
  },
  u_support: {
    id: "u_support",
    role: "ADMIN",
    organizationId: ORG_A,
    isJuniorTechnician: false,
    email: "support@restoreassist.test",
    name: "Platform Support",
  },
};

let caller = "u_admin_a";

function signInAs(userId: string) {
  caller = userId;
  getServerSession.mockResolvedValue({
    user: {
      id: userId,
      role: "ADMIN",
      email: USERS[userId].email,
      name: USERS[userId].name,
    },
  });
}

function post(path: string, body: object): NextRequest {
  return new NextRequest(`http://localhost/api/progress/${REPORT_ID}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = () => ({ params: Promise.resolve({ reportId: REPORT_ID }) });

interface RouteCase {
  name: string;
  call: () => Promise<Response>;
  /** Status the route answers with once the caller is admitted. */
  admittedStatus: number;
  /** Proof the route did its work — never reached for a refused caller. */
  reached: () => ReturnType<typeof vi.fn>;
}

const ROUTES: RouteCase[] = [
  {
    name: "read (GET /api/progress/[reportId])",
    call: () =>
      readGET(
        new NextRequest(`http://localhost/api/progress/${REPORT_ID}`),
        ctx(),
      ),
    admittedStatus: 200,
    reached: () => getState,
  },
  {
    name: "transition",
    call: () =>
      transitionPOST(
        post("/transition", { key: "start_stabilisation" }),
        ctx(),
      ),
    admittedStatus: 200,
    reached: () => transition,
  },
  {
    name: "init",
    call: () => initPOST(post("/init", {}), ctx()),
    admittedStatus: 201,
    reached: () => init,
  },
  {
    name: "attest",
    call: () =>
      attestPOST(
        post("/attest", {
          attestationType: "TECHNICIAN_SIGN_OFF",
          consentToken: "ct_abcdefghij",
          signatureDataUrl: "data:image/png;base64,AAAA",
        }),
        ctx(),
      ),
    admittedStatus: 200,
    reached: () => $transaction,
  },
  {
    name: "pre-attest",
    call: () =>
      preAttestPOST(
        post("/pre-attest", {
          attestationType: "TECHNICIAN_SIGN_OFF",
          contentSummary: "I have read and agree to sign this report.",
          consentAcknowledged: true,
        }),
        ctx(),
      ),
    admittedStatus: 200,
    reached: () => tokenCreate,
  },
  {
    name: "documents (GET carrier-packet PDF)",
    call: () =>
      documentsGET(
        new NextRequest(
          `http://localhost/api/progress/${REPORT_ID}/documents/carrier-packet`,
        ),
        {
          params: Promise.resolve({
            reportId: REPORT_ID,
            type: "carrier-packet",
          }),
        },
      ),
    admittedStatus: 200,
    reached: () => loadClaimDataGraph,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();

  userFindUnique.mockImplementation(
    async (args: { where: { id: string } }) => USERS[args.where.id] ?? null,
  );
  reportFindUnique.mockImplementation(
    async (args: { where: { id: string } }) =>
      args.where.id === REPORT_ID ? REPORT : null,
  );
  claimProgressFindUnique.mockResolvedValue({
    id: "cp_1",
    currentState: "STABILISATION_ACTIVE",
  });
  tokenFindUnique.mockImplementation(async (args: { where: { id: string } }) => ({
    id: args.where.id,
    userId: caller,
    reportId: REPORT_ID,
    attestationType: "TECHNICIAN_SIGN_OFF",
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    contentHash: "ch_test",
  }));
  tokenCreate.mockResolvedValue({
    id: "ct_new",
    expiresAt: new Date(Date.now() + 60_000),
  });
  $transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      attestationConsentToken: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      progressAttestation: {
        create: vi.fn(async () => ({
          id: "att_1",
          attestationType: "TECHNICIAN_SIGN_OFF",
          attestedAt: new Date(),
          integrityHash: "test-integrity-hash",
        })),
      },
    }),
  );
  getState.mockResolvedValue({
    ok: true,
    data: { progress: { id: "cp_1" }, recentTransitions: [] },
  });
  transition.mockResolvedValue({ ok: true, data: { id: "pt_1" } });
  init.mockResolvedValue({ ok: true, data: { id: "cp_1" } });
  loadClaimDataGraph.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(ROUTES)("RA-7628 cross-tenant: $name", (route) => {
  it("(a) refuses an ADMIN of another organisation with 404", async () => {
    // A real allowlist that does not name this caller.
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "u_someone_else");
    signInAs("u_admin_a");

    const res = await route.call();

    expect(res.status).toBe(404);
    expect(route.reached()).not.toHaveBeenCalled();
  });

  it("(b) admits an ADMIN of the report owner's organisation", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "u_someone_else");
    signInAs("u_admin_b");

    const res = await route.call();

    expect(res.status).toBe(route.admittedStatus);
    expect(route.reached()).toHaveBeenCalled();
  });

  it("(c) admits an allowlisted platform-support operator", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "u_other_operator, u_support");
    signInAs("u_support");

    const res = await route.call();

    expect(res.status).toBe(route.admittedStatus);
    expect(route.reached()).toHaveBeenCalled();
  });

  it("(d) refuses that operator when PLATFORM_SUPPORT_USER_IDS is unset", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", undefined);
    signInAs("u_support");

    const res = await route.call();

    expect(res.status).toBe(404);
    expect(route.reached()).not.toHaveBeenCalled();
  });
});
