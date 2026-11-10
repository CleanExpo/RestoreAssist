/**
 * RA-8236: a local PDF becomes a reference, then editable room suggestions.
 *
 * The real browser rasterises page 1 with pdfjs. The storage write and the
 * model read are answered here, so this spec makes no paid call and needs no
 * storage bucket. The server side of both routes is covered by their tests.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";

test.use({ storageState: AUTH_FILE });

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const SHA = "b".repeat(64);
const ROOM_ID = "ai-suggested-e2e-room";

/** A valid two-page PDF, built here so no binary fixture enters the repo. */
function twoPagePdf(): Buffer {
  const content = "0 0 1 rg 20 20 200 100 re f";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 5 0 R /Resources << >> >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 5 0 R /Resources << >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function createInspection(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/inspections", {
    headers: { "Idempotency-Key": `e2e-${Date.now()}-${Math.random()}` },
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

test("a two-page PDF reaches room suggestions by reference only", async ({
  page,
  request,
}) => {
  // The first load of the sketch tab compiles on demand under `next dev`.
  test.setTimeout(150_000);
  const inspectionId = await createInspection(request);
  let readRequests = 0;
  let readBody: unknown = null;
  let uploadedOriginal: string | null = null;
  const externalImageFetches: string[] = [];

  page.on("request", (r) => {
    const url = new URL(r.url());
    if (
      r.resourceType() === "image" &&
      !["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.protocol !== "data:"
    ) {
      externalImageFetches.push(r.url());
    }
  });

  await page.route("**/sketches/underlay*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const raw = route.request().postDataBuffer()?.toString("latin1") ?? "";
    uploadedOriginal = /name="originalMimeType"\r\n\r\n([^\r]+)/.exec(raw)?.[1] ?? null;
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        recorded: true,
        imageUrl: PIXEL,
        referenceId: "ref_e2e",
        contentSha256: SHA,
        floorNumber: 0,
      }),
    });
  });

  await page.route("**/sketches/import-from-image", async (route) => {
    readRequests += 1;
    readBody = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rooms: [
          {
            id: ROOM_ID,
            label: "Lounge",
            vertices: [
              { x: 0.1, y: 0.1 },
              { x: 0.6, y: 0.1 },
              { x: 0.6, y: 0.6 },
              { x: 0.1, y: 0.6 },
            ],
          },
        ],
        reader: { vendor: "anthropic", model: "mocked" },
        reference: { id: "ref_e2e", contentSha256: SHA, floorNumber: 0 },
        promptVersion: "mocked",
      }),
    });
  });

  await page.goto(`/dashboard/inspections/${inspectionId}?tab=sketch`);
  const start = page.getByRole("region", { name: "Start floor plan" });
  await expect(start).toBeVisible({ timeout: 45_000 });

  await start.locator('input[type="file"]').setInputFiles({
    name: "plan.pdf",
    mimeType: "application/pdf",
    buffer: twoPagePdf(),
  });

  await expect(start.getByText(/only page 1 of this 2-page PDF/i)).toBeVisible({
    timeout: 30_000,
  });
  for (const box of await start.getByRole("checkbox").all()) await box.check();
  await start.getByRole("button", { name: "Place on canvas" }).click();

  const suggest = page.getByRole("button", {
    name: "Suggest rooms from this plan",
  });
  await expect(suggest).toBeVisible({ timeout: 20_000 });
  expect(uploadedOriginal).toBe("application/pdf");

  await suggest.click({ timeout: 20_000 });
  await expect(page.getByText(/imported 1 room/i)).toBeVisible({
    timeout: 20_000,
  });
  expect(readBody).toEqual({
    referenceId: "ref_e2e",
    contentSha256: SHA,
    floorNumber: 0,
  });

  // The same read again (a lost-response retry) must not add the room twice.
  await suggest.click();
  await expect(page.getByText(/already on the plan/i)).toBeVisible({
    timeout: 20_000,
  });
  expect(readRequests).toBe(2);
  expect(externalImageFetches).toEqual([]);
});
