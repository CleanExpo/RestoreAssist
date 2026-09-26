/**
 * RA-7769 / D-023 — real-database proof that the report READ routes follow the
 * organisation read reach, the same as the list (`/api/reports`).
 *
 * A technician creates a report; the business owner (same organisation) must
 * be able to open, download, export and share it. A user in another
 * organisation must still be refused. Writes are not widened: the export route
 * must not overwrite the technician's stored Excel URL on the owner's behalf.
 *
 * Runs only when DATABASE_URL is set (`npm run test:db`). Session is mocked;
 * Prisma is real. Rendering, uploads and token signing are mocked because this
 * test proves reach only. Synthetic data only.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// Token signing is not the subject here, and needs a secret this test must not supply.
vi.mock("@/lib/portal-token", () => ({
  generateInsurerToken: () => "signed-token",
  verifyInsurerToken: () => null,
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/generate-iicrc-report-pdf", () => ({
  generateIICRCReportPDF: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
}));
vi.mock("@/lib/reports/append-sketch-pages", () => ({
  appendSketchPages: (bytes: Uint8Array) => Promise.resolve(bytes),
}));
vi.mock("@/lib/reports/append-photo-pages", () => ({
  appendPhotoPages: (bytes: Uint8Array) => Promise.resolve(bytes),
}));
vi.mock("@/lib/excel-export", () => ({
  generateSingleReportExcel: vi.fn().mockResolvedValue({}),
  saveWorkbookAsBuffer: vi.fn().mockResolvedValue(Buffer.from("xlsx")),
}));
vi.mock("@/lib/cloudinary", () => ({
  uploadExcelToCloudinary: vi
    .fn()
    .mockResolvedValue("https://res.cloudinary.com/demo/raw/upload/owner.xlsx"),
  uploadToCloudinary: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { GET as detailGET } from "../[id]/route";
import { POST as insurerLinkPOST } from "../[id]/insurer-link/route";
import { GET as pdfGET } from "../[id]/pdf/route";
import { GET as downloadGET } from "../[id]/download/route";
import { GET as downloadJsonGET } from "../[id]/download-json/route";
import { GET as exportExcelGET } from "../[id]/export-excel/route";
import { GET as nirDataGET } from "../[id]/nir-data/route";
import { GET as approvalsGET } from "../[id]/approvals/route";
import { POST as completenessPOST } from "../completeness-check/route";
import { POST as bulkExcelListPOST } from "../bulk-export-excel-list/route";

const S = `ra7769-read-${Date.now().toString(36)}`;
const SEED_EXCEL_URL = "https://res.cloudinary.com/demo/raw/upload/seed.xlsx";
const ids = { owner: "", tech: "", colleague: "", outsider: "", report: "" };

type Call = () => Promise<Response>;

const url = (path: string) => `http://localhost/api/reports/${ids.report}${path}`;
const ctx = () => ({ params: Promise.resolve({ id: ids.report }) });
const post = (u: string, body?: unknown) =>
  new NextRequest(u, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

/** Each read route, with the status it returns on success and on refusal. */
const routes: Array<{ name: string; ok: number; refused: number; call: Call }> = [
  { name: "GET /api/reports/[id]", ok: 200, refused: 404, call: () => detailGET(new NextRequest(url("")), ctx()) },
  { name: "POST /api/reports/[id]/insurer-link", ok: 200, refused: 404, call: () => insurerLinkPOST(post(url("/insurer-link")), ctx()) },
  // The pdf route has always answered an unauthorised session with 401.
  { name: "GET /api/reports/[id]/pdf", ok: 200, refused: 401, call: () => pdfGET(new NextRequest(url("/pdf")), ctx()) },
  { name: "GET /api/reports/[id]/download", ok: 307, refused: 404, call: () => downloadGET(new NextRequest(url("/download")), ctx()) },
  { name: "GET /api/reports/[id]/download-json", ok: 200, refused: 404, call: () => downloadJsonGET(new NextRequest(url("/download-json")), ctx()) },
  { name: "GET /api/reports/[id]/export-excel", ok: 200, refused: 404, call: () => exportExcelGET(new NextRequest(url("/export-excel")), ctx()) },
  { name: "GET /api/reports/[id]/nir-data", ok: 200, refused: 404, call: () => nirDataGET(new NextRequest(url("/nir-data")), ctx()) },
  { name: "GET /api/reports/[id]/approvals", ok: 200, refused: 404, call: () => approvalsGET(new NextRequest(url("/approvals")), ctx()) },
  {
    name: "POST /api/reports/completeness-check",
    ok: 200,
    refused: 404,
    call: () => completenessPOST(post("http://localhost/api/reports/completeness-check", { reportId: ids.report })),
  },
  {
    name: "POST /api/reports/bulk-export-excel-list",
    ok: 200,
    refused: 404,
    call: () => bulkExcelListPOST(post("http://localhost/api/reports/bulk-export-excel-list", { ids: [ids.report] })),
  },
];

function as(userId: string) {
  getServerSession.mockResolvedValue({ user: { id: userId } });
}

describe.skipIf(!process.env.DATABASE_URL)(
  "report read routes: organisation read reach (RA-7769)",
  () => {
    beforeAll(async () => {
      const owner = await prisma.user.create({
        data: { email: `${S}-owner@test.local`, role: "ADMIN", subscriptionStatus: "TRIAL" },
      });
      const tech = await prisma.user.create({
        data: { email: `${S}-tech@test.local`, role: "USER", subscriptionStatus: "TRIAL" },
      });
      const outsider = await prisma.user.create({
        data: { email: `${S}-out@test.local`, role: "ADMIN", subscriptionStatus: "TRIAL" },
      });
      const colleague = await prisma.user.create({
        data: { email: `${S}-colleague@test.local`, role: "USER", subscriptionStatus: "TRIAL" },
      });
      ids.owner = owner.id;
      ids.tech = tech.id;
      ids.colleague = colleague.id;
      ids.outsider = outsider.id;

      const org = await prisma.organization.create({
        data: { name: `${S} business`, ownerId: owner.id, country: "AU" },
      });
      await prisma.user.updateMany({
        where: { id: { in: [owner.id, tech.id, colleague.id] } },
        data: { organizationId: org.id },
      });
      const otherOrg = await prisma.organization.create({
        data: { name: `${S} other`, ownerId: outsider.id, country: "AU" },
      });
      await prisma.user.update({
        where: { id: outsider.id },
        data: { organizationId: otherOrg.id },
      });

      ids.report = (
        await prisma.report.create({
          data: {
            title: "Synthetic technician report",
            clientName: "Synthetic Client",
            propertyAddress: "1 Synthetic St",
            hazardType: "Water",
            insuranceType: "Building",
            // insurer-link only shares a completed report linked to an inspection.
            status: "COMPLETED",
            excelReportUrl: SEED_EXCEL_URL,
            userId: tech.id,
          },
        })
      ).id;
      await prisma.inspection.create({
        data: {
          inspectionNumber: `${S}-insp`,
          propertyAddress: "1 Synthetic St",
          propertyPostcode: "4000",
          userId: tech.id,
          reportId: ids.report,
        },
      });
    });

    afterAll(async () => {
      const users = [ids.owner, ids.tech, ids.colleague, ids.outsider].filter(Boolean);
      // Audit rows cascade with the inspection.
      await prisma.inspection.deleteMany({ where: { userId: { in: users } } });
      await prisma.report.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.updateMany({ where: { id: { in: users } }, data: { organizationId: null } });
      await prisma.organization.deleteMany({ where: { ownerId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    });

    for (const route of routes) {
      it(`${route.name}: the owner reaches a technician's report`, async () => {
        as(ids.owner);
        const res = await route.call();
        expect(res.status).toBe(route.ok);
      });

      it(`${route.name}: a user in another organisation is refused`, async () => {
        as(ids.outsider);
        const res = await route.call();
        expect(res.status).toBe(route.refused);
      });
    }

    it("a USER colleague reads the job but not the report's money", async () => {
      as(ids.colleague);
      expect((await nirDataGET(new NextRequest(url("/nir-data")), ctx())).status).toBe(200);
      for (const [call, refused] of [
        [() => pdfGET(new NextRequest(url("/pdf")), ctx()), 401],
        [() => downloadGET(new NextRequest(url("/download")), ctx()), 404],
        [() => insurerLinkPOST(post(url("/insurer-link")), ctx()), 404],
      ] as const) {
        as(ids.colleague);
        expect((await call()).status).toBe(refused);
      }
      for (const call of [
        () => approvalsGET(new NextRequest(url("/approvals")), ctx()),
        () => detailGET(new NextRequest(url("")), ctx()),
        () => downloadJsonGET(new NextRequest(url("/download-json")), ctx()),
        () => exportExcelGET(new NextRequest(url("/export-excel")), ctx()),
        () =>
          bulkExcelListPOST(
            post("http://localhost/api/reports/bulk-export-excel-list", { ids: [ids.report] }),
          ),
      ]) {
        as(ids.colleague);
        expect((await call()).status).toBe(404);
      }
    });

    it("export-excel by the owner does not overwrite the technician's stored Excel URL", async () => {
      as(ids.owner);
      const res = await exportExcelGET(new NextRequest(url("/export-excel")), ctx());
      expect(res.status).toBe(200);
      const row = await prisma.report.findUnique({
        where: { id: ids.report },
        select: { excelReportUrl: true },
      });
      expect(row?.excelReportUrl).toBe(SEED_EXCEL_URL);
    });
  },
);
