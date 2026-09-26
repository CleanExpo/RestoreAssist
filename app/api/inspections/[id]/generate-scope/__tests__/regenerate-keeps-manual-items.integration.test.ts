/**
 * Prelaunch audit D-030 — regenerating a scope must keep the technician's own
 * scope items.
 *
 * A technician's item (POST /api/inspections/[id]/scope-items) is stored with
 * autoDetermined = false, and so were the rows AI scope generation wrote. The
 * regenerate deleted every autoDetermined = false row, so it deleted the
 * technician's work. AI rows now carry source = "ai_generate_scope" and only
 * those are replaced.
 *
 * Generates twice against a real database: the hand-entered item must survive
 * both runs, and the AI rows must be replaced rather than duplicated.
 *
 * Runs only when DATABASE_URL is set (`npm run test:db`). Session, the
 * workspace AI key, RAG retrieval and the model stream are mocked; Prisma is
 * real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const generateScopeStream = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/services/ai/generate-scope", () => ({
  generateScopeStream: (...a: unknown[]) => generateScopeStream(...a),
}));
vi.mock("@/lib/ai/rag-context", () => ({
  safeRetrieveSimilarJobs: async () => ({ jobCount: 0, contextPrompt: "" }),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: async () => ({ workspaceId: "ws_test", apiKey: "test-key" }),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));

import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const S = `prelaunch-d030-${Date.now().toString(36)}`;
const ids = { userId: "", inspectionId: "", manualItemId: "" };

async function* streamMarkdown(text: string) {
  yield { type: "content_block_delta", delta: { type: "text_delta", text } };
}

async function generate() {
  generateScopeStream.mockResolvedValueOnce({
    ok: true,
    data: streamMarkdown(
      ["## 1. Extract Standing Water", "", "Extract.", "", "## 2. Install Dehumidification", "", "Dry."].join("\n"),
    ),
  });
  const res = await POST(
    new NextRequest(`http://localhost/api/inspections/${ids.inspectionId}/generate-scope`, {
      method: "POST",
      body: JSON.stringify({ affectedAreaM2: 20 }),
    }),
    { params: Promise.resolve({ id: ids.inspectionId }) },
  );
  expect(res.status).toBe(200);
  const sse = await res.text();
  expect(sse).not.toContain('"type":"error"');
}

describe.skipIf(!process.env.DATABASE_URL)(
  "POST /api/inspections/[id]/generate-scope keeps manual items (D-030)",
  () => {
    beforeAll(async () => {
      const user = await prisma.user.create({
        data: { email: `${S}@test.local`, role: "ADMIN", subscriptionStatus: "ACTIVE" },
      });
      ids.userId = user.id;
      const inspection = await prisma.inspection.create({
        data: {
          inspectionNumber: `${S}-insp`,
          propertyAddress: "1 Scope St",
          propertyPostcode: "4000",
          userId: user.id,
        },
      });
      ids.inspectionId = inspection.id;
      await prisma.classification.create({
        data: {
          inspectionId: inspection.id,
          category: "2",
          class: "2",
          justification: "Synthetic fixture",
          standardReference: "S500:2021",
        },
      });
      // Stored exactly as the scope-items POST stores a technician's item.
      ids.manualItemId = (
        await prisma.scopeItem.create({
          data: {
            inspectionId: inspection.id,
            itemType: "GENERAL",
            description: "Technician: remove skirting in hallway",
            autoDetermined: false,
          },
        })
      ).id;
      getServerSession.mockResolvedValue({ user: { id: user.id } });
    });

    afterAll(async () => {
      if (ids.inspectionId) {
        await prisma.scopeItem.deleteMany({ where: { inspectionId: ids.inspectionId } });
        await prisma.classification.deleteMany({ where: { inspectionId: ids.inspectionId } });
        await prisma.inspection.deleteMany({ where: { id: ids.inspectionId } });
      }
      if (ids.userId) {
        await prisma.usageEvent.deleteMany({ where: { userId: ids.userId } }).catch(() => undefined);
        await prisma.rateLimitHit.deleteMany({ where: { key: { contains: ids.userId } } });
        await prisma.user.deleteMany({ where: { id: ids.userId } });
      }
    });

    it("keeps the technician's item across two regenerates and replaces the AI rows", async () => {
      await generate();
      const afterFirst = await prisma.scopeItem.findMany({
        where: { inspectionId: ids.inspectionId },
        select: { id: true, source: true },
        take: 50,
      });
      expect(afterFirst.map((r) => r.id)).toContain(ids.manualItemId);
      const aiFirst = afterFirst.filter((r) => r.source === "ai_generate_scope");
      expect(aiFirst.length).toBe(2);

      await generate();
      const afterSecond = await prisma.scopeItem.findMany({
        where: { inspectionId: ids.inspectionId },
        select: { id: true, source: true },
        take: 50,
      });
      expect(afterSecond.map((r) => r.id)).toContain(ids.manualItemId);
      const aiSecond = afterSecond.filter((r) => r.source === "ai_generate_scope");
      expect(aiSecond.length).toBe(2);
      expect(aiSecond.map((r) => r.id)).not.toEqual(aiFirst.map((r) => r.id));
    });
  },
);
