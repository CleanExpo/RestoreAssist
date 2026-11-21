import { test, expect, type Response } from "@playwright/test";
import { loginAs, seedInspection, seedAuthorisation } from "./_helpers/auth";

const PROBE_PATH = "/api/authorisations/most-recent";

test("second sign-off: Authorisation < 90 days auto-unlocks form (modal skipped)", async ({
  page,
}) => {
  // The inspection page fires ~20 API calls at mount and `next dev` works
  // through them slowly, so the probe below can land well after page load.
  test.setTimeout(60_000);

  await loginAs(page, "USER");
  await seedInspection(page, { status: "SUBMITTED" });
  await seedAuthorisation(page, {
    subjectLicenceNumber: "IICRC-1",
    whsCardNumber: "WHS-1",
  });

  // RA-8490 / RA-8530: the form unlocks only when InspectionSignOff's
  // mount-time probe of /api/authorisations/most-recent answers. Under
  // `next dev` that answer arrived 5-8 s after page load (measured locally;
  // CI is slower), so a bare 5 s toBeVisible() raced it. Wait on the probe,
  // not the clock. React StrictMode runs the effect twice in dev and discards
  // the first fetch, so wait for EVERY probe request to settle.
  let started = 0;
  let settled = 0;
  const probeResponses: Response[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === PROBE_PATH) started += 1;
  });
  page.on("requestfinished", async (req) => {
    if (new URL(req.url()).pathname !== PROBE_PATH) return;
    const res = await req.response();
    if (res) probeResponses.push(res);
    settled += 1;
  });
  page.on("requestfailed", (req) => {
    if (new URL(req.url()).pathname === PROBE_PATH) settled += 1;
  });

  await page.goto("/dashboard/inspections/test-inspection");

  await expect
    .poll(() => started > 0 && settled === started, {
      message: `every ${PROBE_PATH} probe has answered`,
      timeout: 45_000,
    })
    .toBe(true);

  // The probe must have SEEN the seeded Authorisation. If this fails, the form
  // is locked for a data reason (no row, stale cache), not a timing one.
  const last = probeResponses[probeResponses.length - 1];
  expect(last, `${PROBE_PATH} produced a response`).toBeTruthy();
  expect(last.status()).toBe(200);
  const body = (await last.json()) as { row: { verifiedAt?: string } | null };
  expect(
    body.row?.verifiedAt,
    "probe returned the seeded Authorisation",
  ).toBeTruthy();

  // T3: the probe found a recent Authorisation, so the component is in
  // "form-unlocked" and the licence modal must never appear.
  await expect(page.getByRole("textbox", { name: /Full name/i })).toBeVisible();
  await expect(page.getByText(/Add your credentials/i)).toHaveCount(0);
});
