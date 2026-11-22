/**
 * RA-7687 slice 1: a third-party lab report is read, then only confirmed facts
 * are written. Real routes, real database, real session. No model is called:
 * the workspace here has no AI key, so the read fails closed, which is the
 * failure path that matters most (nothing written). The proposal that the read
 * would have produced is signed here with the same key the server uses, which
 * is what the confirm route is built to trust and nothing else.
 */
import { PDFDocument } from "pdf-lib";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";
import { signProposal } from "../lib/third-party-report/proposal-token";

test.use({ storageState: AUTH_FILE });

const SHA = "c".repeat(64);
async function realPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage();
  return Buffer.from(await doc.save());
}

async function createInspection(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/inspections", {
    headers: { "Idempotency-Key": `e2e-tpr-${Date.now()}-${Math.random()}` },
    data: {
      propertyAddress: "12 Test Street, Melbourne VIC 3000",
      propertyPostcode: "3000",
      claimType: "WATER",
    },
  });
  expect([200, 201]).toContain(res.status());
  const body = await res.json();
  const id = body?.id ?? body?.data?.id ?? body?.inspection?.id;
  expect(id).toBeTruthy();
  return id;
}

async function currentUserId(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/auth/session");
  const body = await res.json();
  expect(body?.user?.id).toBeTruthy();
  return body.user.id;
}

const FACTS = [
  { field: "labName", value: "Acme Analytical", pageRef: 1, quote: "Analysed by Acme Analytical" },
  { field: "sporeCountPreRemediation", value: 5000, pageRef: 4, quote: "5000 spores/m3" },
  { field: "sporeType", value: "Aspergillus", pageRef: 3, quote: "Aspergillus/Penicillium" },
];

async function proposalFor(request: APIRequestContext, inspectionId: string) {
  return signProposal({
    inspectionId,
    userId: await currentUserId(request),
    sha256: SHA,
    fileName: "lab.pdf",
    document: { title: null, author: "Acme", reportDate: null },
    facts: FACTS as never,
    exp: Date.now() + 60_000,
  });
}

const assessment = async (request: APIRequestContext, id: string) =>
  (await request.get(`/api/inspections/${id}/mould-remediation`)).json();

test("a failed read writes nothing, and a dismissed or forged review writes nothing", async ({ request }) => {
  const id = await createInspection(request);
  const base = `/api/inspections/${id}/third-party-reports`;

  // 1. A non-PDF is refused before any spend.
  const notPdf = await request.post(`${base}/extract`, {
    multipart: { file: { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("GIF89a" + "y".repeat(300)) } },
  });
  expect(notPdf.status()).toBe(400);

  // 2. The signed-in user has role USER, which may not spend the workspace's AI
  //    key: the read is refused with 403 before any key lookup or model call.
  const read = await request.post(`${base}/extract`, {
    multipart: { file: { name: "lab.pdf", mimeType: "application/pdf", buffer: await realPdf() } },
  });
  expect(read.status()).toBe(403);
  expect(await assessment(request, id)).toBeNull();

  // 3. A token the server did not sign is refused.
  const forged = await request.post(`${base}/confirm`, {
    data: { proposalToken: "forged.token-value-1234567890", decisions: [{ index: 0, action: "accept" }] },
  });
  expect(forged.status()).toBe(400);
  expect(await assessment(request, id)).toBeNull();

  // 4. A signed proposal with every fact dismissed writes nothing.
  const token = await proposalFor(request, id);
  const dismissed = await request.post(`${base}/confirm`, {
    data: { proposalToken: token, decisions: FACTS.map((_, index) => ({ index, action: "dismiss" })) },
  });
  expect(await dismissed.json()).toEqual({ written: 0, dismissed: 3, applied: {} });
  expect(await assessment(request, id)).toBeNull();

  // 5. A signed proposal for another job is refused.
  const other = await createInspection(request);
  const wrongJob = await request.post(`/api/inspections/${other}/third-party-reports/confirm`, {
    data: { proposalToken: token, decisions: [{ index: 0, action: "accept" }] },
  });
  expect(wrongJob.status()).toBe(400);
  expect(await assessment(request, other)).toBeNull();
});

test("accepting and editing writes exactly those facts, and no condition or clearance", async ({ request }) => {
  const id = await createInspection(request);
  const token = await proposalFor(request, id);

  const res = await request.post(`/api/inspections/${id}/third-party-reports/confirm`, {
    data: {
      proposalToken: token,
      decisions: [
        { index: 0, action: "accept" },
        { index: 1, action: "edit", value: "5200" },
        { index: 2, action: "dismiss" },
      ],
    },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({
    written: 2,
    dismissed: 1,
    applied: { labName: "Acme Analytical", sporeCountPreRemediation: 5200 },
  });

  const saved = await assessment(request, id);
  expect(saved.labName).toBe("Acme Analytical");
  expect(saved.sporeCountPreRemediation).toBe(5200);
  expect(saved.sporeType).toBeNull(); // dismissed
  expect(saved.mouldConditionLevel).toBeNull();
  expect(saved.clearanceCriterion).toBeNull();

  // An empty edit is refused, not saved as zero.
  const empty = await request.post(`/api/inspections/${id}/third-party-reports/confirm`, {
    data: { proposalToken: token, decisions: [{ index: 1, action: "edit", value: "" }] },
  });
  expect(empty.status()).toBe(400);
  expect((await assessment(request, id)).sporeCountPreRemediation).toBe(5200);
});
