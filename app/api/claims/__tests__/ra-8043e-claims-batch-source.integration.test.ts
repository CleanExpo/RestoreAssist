/**
 * RA-8043e Slice 1a — real-database proof for claim analysis batches.
 *
 * - Every batch analyze-batch creates is PLATFORM_SERVICE_ACCOUNT with no firm,
 *   even when the operator belongs to one; the database CHECK
 *   claim_batch_source_org refuses any other pairing.
 * - document/[fileId] serves only the caller's own row, checked inside the query.
 * - A save failure in either path ends the batch FAILED and logs at error level
 *   with batchId, userId, source and stage.
 * - Re-analysing a file in a new batch still moves the one row (keys unchanged).
 * - maxDocuments is a whole number from 1 to 100; omitted means at most 100.
 * - CLAIMS_ANALYSIS_PAUSED=1 refuses work before any Drive or model call.
 *
 * Runs only when DATABASE_URL is set (`npm run test:db`). Session, Drive and the
 * model are mocked; Prisma and Postgres are real. Synthetic data only.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

type Read = { method: string; args: unknown };

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  listDriveItems: vi.fn(),
  downloadDriveFile: vi.fn(),
  performRevolutionaryGapAnalysis: vi.fn(),
  performGapAnalysis: vi.fn(),
  retrieveRelevantStandards: vi.fn(),
  getIntegrationsForUser: vi.fn(),
  // When set, the next prisma.$transaction call runs this instead (forced P2002).
  transactionOverride: null as null | ((...args: unknown[]) => Promise<never>),
  claimAnalysisReads: [] as Read[],
}));

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => h.getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/billing/subscription-gate", () => ({
  hasActiveSubscription: async () => true,
}));
vi.mock("@/lib/ai-provider", () => ({
  getIntegrationsForUser: (...a: unknown[]) => h.getIntegrationsForUser(...a),
}));
vi.mock("@/lib/standards-retrieval", () => ({
  retrieveRelevantStandards: (...a: unknown[]) =>
    h.retrieveRelevantStandards(...a),
  buildStandardsContextPrompt: () => "",
}));
vi.mock("@/lib/google-drive", () => ({
  listDriveItems: (...a: unknown[]) => h.listDriveItems(...a),
  downloadDriveFile: (...a: unknown[]) => h.downloadDriveFile(...a),
}));
vi.mock("@/lib/gap-analysis", () => ({
  performGapAnalysis: (...a: unknown[]) => h.performGapAnalysis(...a),
}));
vi.mock("@/lib/revolutionary-gap-analysis", () => ({
  performRevolutionaryGapAnalysis: (...a: unknown[]) =>
    h.performRevolutionaryGapAnalysis(...a),
}));
// Real Prisma, wrapped so a test can force one transaction to fail and can see
// the exact query document/[fileId] sends.
vi.mock("@/lib/prisma", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/prisma")>("@/lib/prisma");
  const real = actual.prisma as unknown as Record<string | symbol, unknown>;
  const prisma = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "$transaction" && h.transactionOverride) {
          const override = h.transactionOverride;
          h.transactionOverride = null;
          return override;
        }
        if (prop === "claimAnalysis") {
          const delegate = real.claimAnalysis as Record<string | symbol, unknown>;
          return new Proxy(delegate, {
            get(d, m) {
              const v = d[m];
              if (typeof v !== "function") return v;
              const fn = v as (...a: unknown[]) => unknown;
              if (m === "findFirst" || m === "findUnique") {
                return (args: unknown) => {
                  h.claimAnalysisReads.push({ method: String(m), args });
                  return fn.call(d, args);
                };
              }
              return fn.bind(d);
            },
          });
        }
        return real[prop];
      },
    },
  );
  return { ...actual, prisma };
});

import { prisma } from "@/lib/prisma";
import { POST } from "../analyze-batch/route";
import { GET } from "../document/[fileId]/route";

const S = `ra8043e-${Date.now().toString(36)}`;
const ids = { operator: "", other: "", org: "", otherOrg: "" };
const savedEnv = {
  support: process.env.PLATFORM_SUPPORT_USER_IDS,
  paused: process.env.CLAIMS_ANALYSIS_PAUSED,
};

type DriveFile = { id: string; name: string; mimeType: string };
const pdf = (tag: string, i = 0): DriveFile => ({
  id: `${S}-${tag}-${i}`,
  name: `claim-${tag}-${i}.pdf`,
  mimeType: "application/pdf",
});

function analysisResult(
  file: { id: string; name: string },
  overrides: Record<string, unknown> = {},
) {
  return {
    fileName: file.name,
    fileId: file.id,
    issues: [
      {
        category: "iicrc",
        elementName: "Moisture map",
        description: "Synthetic missing element",
        severity: "HIGH",
        isBillable: true,
        estimatedCost: 100,
      },
    ],
    missingElements: {
      iicrc: 1,
      australianStandards: 0,
      ohs: 0,
      whs: 0,
      scopeOfWorks: 0,
      billing: 0,
      documentation: 0,
      equipment: 0,
      monitoring: 0,
    },
    scores: {
      completeness: 80,
      compliance: 70,
      standardization: 60,
      scopeAccuracy: 50,
      billingAccuracy: 40,
    },
    estimatedMissingRevenue: 100,
    standardsReferenced: [],
    complianceGaps: [],
    reportStructure: {},
    technicianPattern: {},
    ...overrides,
  };
}

async function analyse(body: Record<string, unknown>) {
  h.getServerSession.mockResolvedValue({
    user: { id: ids.operator, role: "ADMIN" },
  });
  const res = await POST(
    new NextRequest("http://localhost/api/claims/analyze-batch", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
  // The stream starts work at construction; drain it before reading the DB.
  // Base code errors the stream instead of closing it, so keep the reason.
  const text = await res.text().catch((e: unknown) => `STREAM_ERRORED ${e}`);
  return { status: res.status, text };
}

function getDocument(userId: string, fileId: string) {
  h.getServerSession.mockResolvedValue({ user: { id: userId } });
  return GET(
    new NextRequest(`http://localhost/api/claims/document/${fileId}`),
    { params: Promise.resolve({ fileId }) },
  );
}

const batchesIn = (folderId: string) =>
  prisma.claimAnalysisBatch.findMany({
    where: { folderId },
    select: {
      id: true,
      userId: true,
      source: true,
      organizationId: true,
      status: true,
      totalFiles: true,
      errorMessage: true,
    },
  });

let errorSpy: ReturnType<typeof vi.spyOn>;

/** Error-level structured log lines (reportError writes `[error]`, JSON). */
function errorLogsFor(batchId: string): Record<string, unknown>[] {
  return errorSpy.mock.calls
    .filter((c: unknown[]) => c[0] === "[error]" && typeof c[1] === "string")
    .map((c: unknown[]) => {
      try {
        return JSON.parse(c[1] as string) as Record<string, unknown>;
      } catch {
        return {};
      }
    })
    .filter((p: Record<string, unknown>) => p.batchId === batchId);
}

function expectSaveFailureLogged(batchId: string) {
  expect(errorLogsFor(batchId)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        batchId,
        userId: ids.operator,
        source: "PLATFORM_SERVICE_ACCOUNT",
        stage: "save-results",
      }),
    ]),
  );
}

describe.skipIf(!process.env.DATABASE_URL)(
  "RA-8043e Slice 1a: claim batch source, firm CHECK, save failures, cap, pause",
  () => {
    beforeAll(async () => {
      const operator = await prisma.user.create({
        data: { email: `${S}-op@test.local`, role: "ADMIN", subscriptionStatus: "ACTIVE" },
      });
      const other = await prisma.user.create({
        data: { email: `${S}-other@test.local`, role: "ADMIN", subscriptionStatus: "ACTIVE" },
      });
      ids.operator = operator.id;
      ids.other = other.id;
      const org = await prisma.organization.create({
        data: { name: `${S} firm`, ownerId: operator.id, country: "AU" },
      });
      ids.org = org.id;
      await prisma.user.update({
        where: { id: operator.id },
        data: { organizationId: org.id },
      });
      process.env.PLATFORM_SUPPORT_USER_IDS = operator.id;
    });

    afterAll(async () => {
      const users = [ids.operator, ids.other].filter(Boolean);
      await prisma.claimAnalysisBatch.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.updateMany({ where: { id: { in: users } }, data: { organizationId: null } });
      await prisma.organization.deleteMany({ where: { ownerId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      if (savedEnv.support === undefined) delete process.env.PLATFORM_SUPPORT_USER_IDS;
      else process.env.PLATFORM_SUPPORT_USER_IDS = savedEnv.support;
      if (savedEnv.paused === undefined) delete process.env.CLAIMS_ANALYSIS_PAUSED;
      else process.env.CLAIMS_ANALYSIS_PAUSED = savedEnv.paused;
    });

    beforeEach(() => {
      delete process.env.CLAIMS_ANALYSIS_PAUSED;
      for (const fn of [
        h.listDriveItems,
        h.downloadDriveFile,
        h.performRevolutionaryGapAnalysis,
        h.performGapAnalysis,
        h.retrieveRelevantStandards,
        h.getIntegrationsForUser,
      ]) {
        fn.mockReset();
      }
      h.transactionOverride = null;
      h.claimAnalysisReads.length = 0;
      h.getIntegrationsForUser.mockResolvedValue([{ apiKey: "synthetic-key" }]);
      h.retrieveRelevantStandards.mockResolvedValue([]);
      h.downloadDriveFile.mockResolvedValue({
        buffer: Buffer.from("%PDF-1.4 synthetic"),
        mimeType: "application/pdf",
      });
      h.performRevolutionaryGapAnalysis.mockImplementation(
        async (f: { id: string; name: string }) => analysisResult(f),
      );
      h.performGapAnalysis.mockImplementation(
        async (files: Array<{ id: string; name: string }>) =>
          files.map((f) => analysisResult(f)),
      );
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("[ra-8043e] T1s streaming batch is PLATFORM_SERVICE_ACCOUNT with no firm though the operator belongs to one", async () => {
      const op = await prisma.user.findUnique({ where: { id: ids.operator } });
      expect(op?.organizationId).toBe(ids.org);
      const folderId = `${S}-t1s`;
      h.listDriveItems.mockResolvedValue({ files: [pdf("t1s")] });

      const { status } = await analyse({ folderId, stream: true });

      expect(status).toBe(200);
      const batches = await batchesIn(folderId);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({
        source: "PLATFORM_SERVICE_ACCOUNT",
        organizationId: null,
        status: "COMPLETED",
      });
    });

    it("[ra-8043e] T1n non-streaming batch is PLATFORM_SERVICE_ACCOUNT with no firm though the operator belongs to one", async () => {
      const folderId = `${S}-t1n`;
      h.listDriveItems.mockResolvedValue({ files: [pdf("t1n")] });

      const { status } = await analyse({ folderId, stream: false });

      expect(status).toBe(200);
      const batches = await batchesIn(folderId);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({
        source: "PLATFORM_SERVICE_ACCOUNT",
        organizationId: null,
        status: "COMPLETED",
      });
    });

    it("[ra-8043e] T2a the database refuses a service-account batch that carries a firm", async () => {
      const refusal = await prisma.claimAnalysisBatch
        .create({
          data: {
            userId: ids.operator,
            folderId: `${S}-t2a`,
            source: "PLATFORM_SERVICE_ACCOUNT",
            organizationId: ids.org,
          },
        })
        .then(
          () => "stored",
          (e: unknown) => String(e),
        );
      expect(refusal).toMatch(/claim_batch_source_org/);
      expect(await batchesIn(`${S}-t2a`)).toHaveLength(0);
    });

    it("[ra-8043e] T2b the database refuses a firm batch with no firm", async () => {
      const refusal = await prisma.claimAnalysisBatch
        .create({
          data: {
            userId: ids.operator,
            folderId: `${S}-t2b`,
            source: "FIRM_OAUTH",
          },
        })
        .then(
          () => "stored",
          (e: unknown) => String(e),
        );
      expect(refusal).toMatch(/claim_batch_source_org/);
      expect(await batchesIn(`${S}-t2b`)).toHaveLength(0);
    });

    it("[ra-8043e] T2c a firm batch with its firm is stored, and deleting the firm deletes it", async () => {
      const firm = await prisma.organization.create({
        data: { name: `${S} other firm`, ownerId: ids.other, country: "AU" },
      });
      const batch = await prisma.claimAnalysisBatch.create({
        data: {
          userId: ids.other,
          folderId: `${S}-t2c`,
          source: "FIRM_OAUTH",
          organizationId: firm.id,
        },
      });
      expect(batch).toMatchObject({ source: "FIRM_OAUTH", organizationId: firm.id });
      await prisma.organization.delete({ where: { id: firm.id } });
      expect(await batchesIn(`${S}-t2c`)).toHaveLength(0);
    });

    describe("document/[fileId]", () => {
      const fileId = `${S}-doc`;

      beforeAll(async () => {
        const batch = await prisma.claimAnalysisBatch.create({
          data: { userId: ids.operator, folderId: `${S}-t3`, status: "COMPLETED" },
        });
        await prisma.claimAnalysis.create({
          data: { batchId: batch.id, googleDriveFileId: fileId, fileName: "doc.pdf" },
        });
      });

      it("[ra-8043e] T3a the batch owner gets the document", async () => {
        const res = await getDocument(ids.operator, fileId);
        expect(res.status).toBe(200);
        expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("%PDF-1.4 synthetic");
        expect(h.downloadDriveFile).toHaveBeenCalledWith(fileId);
      });

      it("[ra-8043e] T3b another user gets 404 and Drive is never called", async () => {
        const res = await getDocument(ids.other, fileId);
        expect(res.status).toBe(404);
        expect(h.downloadDriveFile).not.toHaveBeenCalled();
      });

      it("[ra-8043e] T3c the user check is inside the database query", async () => {
        await getDocument(ids.other, fileId);
        expect(h.claimAnalysisReads).toHaveLength(1);
        expect(h.claimAnalysisReads[0].args).toMatchObject({
          where: { googleDriveFileId: fileId, batch: { userId: ids.other } },
        });
      });
    });

    it("[ra-8043e] T4s a streaming save failure ends the batch FAILED with an error log and an error line", async () => {
      const folderId = `${S}-t4s`;
      const [good, bad] = [pdf("t4s", 0), pdf("t4s", 1)];
      h.listDriveItems.mockResolvedValue({ files: [good, bad] });
      // fileName is required on ClaimAnalysis: Prisma rejects the write inside the transaction.
      h.performRevolutionaryGapAnalysis.mockImplementation(
        async (f: { id: string; name: string }) =>
          analysisResult(f, f.id === bad.id ? { fileName: undefined } : {}),
      );

      const { text } = await analyse({ folderId, stream: true });

      const batches = await batchesIn(folderId);
      expect(batches).toHaveLength(1);
      expect(batches[0].status).toBe("FAILED");
      expect(batches[0].errorMessage).toBeTruthy();
      expectSaveFailureLogged(batches[0].id);
      const lines = text
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l) as Record<string, unknown>;
          } catch {
            return {};
          }
        });
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "error", batchId: batches[0].id }),
        ]),
      );
      expect(await prisma.claimAnalysis.count({ where: { batchId: batches[0].id } })).toBe(0);
    });

    it("[ra-8043e] T4n a non-streaming save failure ends the batch FAILED with an error log", async () => {
      const folderId = `${S}-t4n`;
      const [good, bad] = [pdf("t4n", 0), pdf("t4n", 1)];
      h.listDriveItems.mockResolvedValue({ files: [good, bad] });
      h.performGapAnalysis.mockImplementation(
        async (files: Array<{ id: string; name: string }>) =>
          files.map((f) =>
            analysisResult(f, f.id === bad.id ? { fileName: undefined } : {}),
          ),
      );

      const { status } = await analyse({ folderId, stream: false });

      expect(status).toBe(500);
      const batches = await batchesIn(folderId);
      expect(batches).toHaveLength(1);
      expect(batches[0].status).toBe("FAILED");
      expect(batches[0].errorMessage).toBeTruthy();
      expectSaveFailureLogged(batches[0].id);
    });

    const p2002 = async (): Promise<never> => {
      throw new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`googleDriveFileId`)",
        { code: "P2002", clientVersion: "test" },
      );
    };

    it("[ra-8043e] T4ps a P2002 in the streaming save step is logged at error level with batchId and stage", async () => {
      const folderId = `${S}-t4ps`;
      h.listDriveItems.mockResolvedValue({ files: [pdf("t4ps")] });
      h.transactionOverride = p2002;

      await analyse({ folderId, stream: true });

      const batches = await batchesIn(folderId);
      expect(batches).toHaveLength(1);
      expectSaveFailureLogged(batches[0].id);
      expect(batches[0].status).toBe("FAILED");
    });

    it("[ra-8043e] T4pn a P2002 in the non-streaming save step is logged at error level with batchId and stage", async () => {
      const folderId = `${S}-t4pn`;
      h.listDriveItems.mockResolvedValue({ files: [pdf("t4pn")] });
      h.transactionOverride = p2002;

      await analyse({ folderId, stream: false });

      const batches = await batchesIn(folderId);
      expect(batches).toHaveLength(1);
      expectSaveFailureLogged(batches[0].id);
      expect(batches[0].status).toBe("FAILED");
    });

    it("[ra-8043e] T5 re-analysing an analysed file in a new batch moves its one row to the new batch", async () => {
      const file = pdf("t5");
      h.listDriveItems.mockResolvedValue({ files: [file] });
      await analyse({ folderId: `${S}-t5a`, stream: true });
      const [first] = await batchesIn(`${S}-t5a`);
      expect(first?.status).toBe("COMPLETED");
      expect(
        await prisma.claimAnalysis.findMany({
          where: { googleDriveFileId: file.id },
          select: { batchId: true },
        }),
      ).toEqual([{ batchId: first.id }]);

      h.performRevolutionaryGapAnalysis.mockImplementation(
        async (f: { id: string; name: string }) =>
          analysisResult(f, {
            scores: {
              completeness: 55,
              compliance: 55,
              standardization: 55,
              scopeAccuracy: 55,
              billingAccuracy: 55,
            },
          }),
      );
      await analyse({ folderId: `${S}-t5b`, stream: true });
      const [second] = await batchesIn(`${S}-t5b`);
      expect(second?.status).toBe("COMPLETED");
      const rows = await prisma.claimAnalysis.findMany({
        where: { googleDriveFileId: file.id },
        select: { id: true, batchId: true, completenessScore: true },
      });
      expect(rows).toEqual([
        expect.objectContaining({ batchId: second.id, completenessScore: 55 }),
      ]);
      expect(await prisma.missingElement.count({ where: { analysisId: rows[0].id } })).toBe(1);
    });

    it("[ra-8043e] T6a maxDocuments 101 returns 400 before any Drive or model call", async () => {
      const folderId = `${S}-t6a`;
      h.listDriveItems.mockResolvedValue({ files: [pdf("t6a")] });

      const { status } = await analyse({ folderId, maxDocuments: 101, stream: true });

      expect(status).toBe(400);
      expect(h.listDriveItems).not.toHaveBeenCalled();
      expect(h.retrieveRelevantStandards).not.toHaveBeenCalled();
      expect(h.performRevolutionaryGapAnalysis).not.toHaveBeenCalled();
      expect(await batchesIn(folderId)).toHaveLength(0);
    });

    it("[ra-8043e] T6b a maxDocuments that is not a whole number from 1 to 100 returns 400", async () => {
      h.listDriveItems.mockResolvedValue({ files: [pdf("t6b")] });
      const statuses: unknown[] = [];
      for (const maxDocuments of [0, -1, 2.5, "abc", "101", true]) {
        const { status } = await analyse({ folderId: `${S}-t6b`, maxDocuments, stream: true });
        statuses.push(status);
      }
      expect(statuses).toEqual([400, 400, 400, 400, 400, 400]);
      expect(h.listDriveItems).not.toHaveBeenCalled();
      expect(await batchesIn(`${S}-t6b`)).toHaveLength(0);
    });

    it("[ra-8043e] T6c with maxDocuments omitted a 150-file folder processes at most 100", async () => {
      const folderId = `${S}-t6c`;
      h.listDriveItems.mockResolvedValue({
        files: Array.from({ length: 150 }, (_, i) => pdf("t6c", i)),
      });

      const { status } = await analyse({ folderId, stream: true });

      expect(status).toBe(200);
      expect(h.performRevolutionaryGapAnalysis).toHaveBeenCalledTimes(100);
      const batches = await batchesIn(folderId);
      expect(batches).toHaveLength(1);
      expect(batches[0].totalFiles).toBe(100);
      expect(await prisma.claimAnalysis.count({ where: { batchId: batches[0].id } })).toBe(100);
    }, 120_000);

    it("[ra-8043e] T7a CLAIMS_ANALYSIS_PAUSED=1 returns 503 with no batch and no Drive or model call", async () => {
      const folderId = `${S}-t7a`;
      process.env.CLAIMS_ANALYSIS_PAUSED = "1";
      h.listDriveItems.mockResolvedValue({ files: [pdf("t7a")] });

      h.getServerSession.mockResolvedValue({ user: { id: ids.operator, role: "ADMIN" } });
      const res = await POST(
        new NextRequest("http://localhost/api/claims/analyze-batch", {
          method: "POST",
          body: JSON.stringify({ folderId, stream: true }),
          headers: { "Content-Type": "application/json" },
        }),
      );
      const body = await res.text().catch(() => "");

      expect(res.status).toBe(503);
      expect(JSON.parse(body)).toMatchObject({ error: { code: "CLAIMS_ANALYSIS_PAUSED" } });
      expect(h.listDriveItems).not.toHaveBeenCalled();
      expect(h.getIntegrationsForUser).not.toHaveBeenCalled();
      expect(h.retrieveRelevantStandards).not.toHaveBeenCalled();
      expect(h.performRevolutionaryGapAnalysis).not.toHaveBeenCalled();
      expect(await batchesIn(folderId)).toHaveLength(0);
    });

    it("[ra-8043e] T7b CLAIMS_ANALYSIS_PAUSED other than exactly 1 analyses normally", async () => {
      h.listDriveItems.mockResolvedValue({ files: [pdf("t7b")] });
      for (const value of ["true", "0", " 1"]) {
        process.env.CLAIMS_ANALYSIS_PAUSED = value;
        const { status } = await analyse({ folderId: `${S}-t7b-${value.trim() || "x"}`, stream: true });
        expect(status).toBe(200);
      }
      expect(h.performRevolutionaryGapAnalysis).toHaveBeenCalledTimes(3);
    });
  },
);
