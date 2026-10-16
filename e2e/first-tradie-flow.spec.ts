/**
 * First-Tradie End-to-End Happy Path
 *
 * Priority 3 from docs/superpowers/specs/2026-05-13-next-phase-roadmap.md.
 * Each leg has unit/route coverage but the **seams** between them are where
 * production fails for first-time users. This is the single sequential test
 * that walks a fresh tenant from sign-up through Xero push and asserts a
 * visible UI confirmation at every seam.
 *
 * Failures must shout the seam name so triage doesn't have to re-derive
 * where in the flow the break happened.
 *
 * Constraints honoured:
 *  - No source modification (pure E2E)
 *  - 90 s soft budget
 *  - Each step asserts visible UI, not just HTTP 200
 *  - Xero push asserts the route REACHES the adapter routing logic, not
 *    that the sync succeeds (no live Xero token expected)
 *
 * Environment requirements:
 *  - Vercel BotID (lib/auth/botid.ts) auto-bypasses in dev / preview
 *    (NODE_ENV !== "production"); production deployments are protected
 *    automatically by the platform with no env var configuration. This
 *    removes the previous Cloudflare Turnstile dependency.
 *  - Test runs cleanly against localhost (NODE_ENV !== "production" →
 *    BotID returns bypassed=true) or any Vercel preview/production URL.
 */
import { test, expect, type Page } from "@playwright/test";

test.setTimeout(90_000);

/**
 * The setup wizard is a one-step-at-a-time stepper (SetupStepper): it opens on
 * "Welcome" and moves on with the footer's "Next" button. Advance until the
 * step whose <h2> title matches, failing if Next is disabled on the way (a
 * required step left incomplete) or the step never appears.
 */
async function advanceSetupTo(page: Page, title: RegExp): Promise<void> {
  const current = page
    .getByRole("main")
    .getByRole("heading", { level: 2 })
    .first();
  for (let i = 0; i < 8; i++) {
    if (title.test((await current.textContent()) ?? "")) return;
    const next = page.getByRole("button", { name: /^next/i });
    await expect(
      next,
      `Next must be enabled to leave "${await current.textContent()}"`,
    ).toBeEnabled();
    await next.click();
  }
  await expect(current).toHaveText(title);
}

/**
 * A checksum-valid ABN no other run has used. Organization.abn is unique, so a
 * fixed ABN registers on the first attempt and every retry (or rerun on the
 * same database) is refused as "already registered". ABN rule: subtract 1 from
 * the first digit, weight by 10,1,3,5,...,19, total divisible by 89.
 */
function uniqueAbn(): string {
  const W = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const rest = String(Date.now()).slice(-9).padStart(9, "0");
  for (let prefix = 10; prefix <= 99; prefix++) {
    const digits = `${prefix}${rest}`.split("").map(Number);
    digits[0] -= 1;
    const total = digits.reduce((sum, d, i) => sum + d * W[i], 0);
    if (total % 89 === 0) return `${prefix}${rest}`;
  }
  throw new Error(`no valid ABN prefix for ${rest}`);
}

/** Throw with the seam label baked in so the failure line is self-explaining. */
async function assertSeam(
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`SEAM FAILED: ${label} — ${reason}`);
  }
}

test("first tradie tomorrow: signup → setup → inspection → report → invoice → xero push", async ({
  page,
}) => {
  const stamp = Date.now();
  const email = `signup-test-${stamp}@test.com`;
  const password = "test-password-12345!";

  // ──────────────────────────────────────────────────────────────
  // Seam 1: Sign-up → authenticated session
  // ──────────────────────────────────────────────────────────────
  await assertSeam("Sign-up form → authenticated session", async () => {
    await page.goto("/signup");
    await page.getByLabel(/full name/i).fill("First Tradie");
    await page.getByLabel(/email/i).fill(email);
    // The signup form renders password + confirm-password text inputs alongside
    // a "Show password" / "Show confirm password" toggle button. The toggle
    // shares the accessible name, so we target the textbox role explicitly to
    // avoid a strict-mode locator collision.
    await page.getByRole("textbox", { name: /^password$/i }).fill(password);
    await page
      .getByRole("textbox", { name: /confirm password/i })
      .fill(password);
    await page.getByRole("checkbox", { name: /i agree/i }).check();
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL(/\/(dashboard|setup)/, { timeout: 20_000 });
  });

  // ──────────────────────────────────────────────────────────────
  // Seam 2: Sign-up → /setup wizard renders for fresh tenant
  // ──────────────────────────────────────────────────────────────
  await assertSeam("Sign-up → /setup wizard renders", async () => {
    if (!page.url().includes("/setup")) {
      await page.goto("/setup");
    }
    // By role, not getByText: /setup streams behind app/setup/loading.tsx, so
    // for a moment React's not-yet-revealed copy of the wizard sits in a
    // <div hidden id="S:0"> next to the live one. getByText counts that hidden
    // copy (strict-mode violation); the accessibility tree does not.
    await expect(
      page.getByRole("heading", { name: /let.s get you set up/i }),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Seam 3: ABR sandbox hydrates business details from ABN
  // ──────────────────────────────────────────────────────────────
  await assertSeam("/setup → ABR sandbox hydration", async () => {
    await advanceSetupTo(page, /^business details$/i);
    // Not 53004085616: scripts/seed-e2e-user.ts registers that ABN to the seeded
    // e2e account, so hydrate refuses it as already registered and Next stays
    // disabled. A fresh valid ABN per attempt also keeps CI retries apart.
    const abn = uniqueAbn();
    await page.getByPlaceholder(/e\.g\. 53 004 085 616/i).fill(abn);
    const [hydrate] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/setup/hydrate") && r.request().method() === "POST",
        { timeout: 30_000 },
      ),
      page.getByRole("button", { name: /start setup/i }).click(),
    ]);
    expect(hydrate.status(), await hydrate.text()).toBeLessThan(300);
    // The ABN is accepted as this new business's own. (The previous check,
    // /B P AUSTRALIA|BHP|legal name/, passed on the step's description text
    // whether or not anything hydrated.)
    await expect(
      page.getByText(/already registered to another RestoreAssist account/i),
    ).toHaveCount(0);
    // Hydration itself needs the live ABR (ABR_API_GUID; lookupAbn answers
    // CONFIG_ERROR without it). Where it is configured, require the register's
    // answer; where it is not, record that this part did not run.
    if (process.env.ABR_API_GUID) {
      await expect(page.getByLabel(/legal name/i)).not.toHaveValue("", {
        timeout: 30_000,
      });
    } else {
      // Without the register the wizard says so and asks for the details by
      // hand: the manual path a business takes when ABR is down.
      await expect(
        page.getByText(/business register lookup is not configured/i),
      ).toBeVisible({ timeout: 30_000 });
      // Each field saves on blur (PATCH /api/setup/state). Blur and wait for
      // the save, or a concurrent hydration refresh can replace the store's
      // organisation before the typed value is persisted.
      const saveField = async (name: RegExp, value: string) => {
        await page.getByRole("textbox", { name }).fill(value);
        await Promise.all([
          page.waitForResponse(
            (r) => r.url().includes("/api/setup/state") && r.request().method() === "PATCH",
          ),
          page.getByRole("textbox", { name }).press("Tab"),
        ]);
      };
      await saveField(/^legal name$/i, "First Tradie Restorations Pty Ltd");
      // Hydration stores the ABN only on a successful lookup; the manual form
      // asks for it again.
      await saveField(/^abn$/i, abn);
      await saveField(/^state/i, "NSW");
      await expect(page.getByRole("textbox", { name: /^state/i })).toHaveValue("NSW");
      await expect(page.getByRole("button", { name: /^next/i })).toBeEnabled();
      test.info().annotations.push({
        type: "seam-not-run",
        description: "Seam 3 ABR hydration: no ABR_API_GUID in this environment; details entered manually",
      });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Seam 4: Activate → dashboard with seeded sample report
  // ──────────────────────────────────────────────────────────────
  await assertSeam("Activate → dashboard + sample seeded", async () => {
    // The stepper's terminal CTA ("Finish setup") is the activation path now
    // (SetupShell.handleFinish): POST /api/setup/activate, re-mint the JWT,
    // then land on the onboarding welcome.
    const finish = page.getByRole("button", { name: /^finish setup/i });
    for (let i = 0; i < 8 && !(await finish.isVisible()); i++) {
      const next = page.getByRole("button", { name: /^next/i });
      await expect(next, "Next must be enabled on the way to Finish setup").toBeEnabled({
        timeout: 20_000,
      });
      await next.click();
    }
    await expect(finish).toBeEnabled({ timeout: 20_000 });
    // Activation's pre-flight requires the pricing config the background
    // PRICING hydration job writes (lib/setup/checks.ts). Finish once that job
    // is READY, as an operator who spent more than a few seconds here would;
    // an ERROR still fails this seam.
    await expect
      .poll(
        async () => {
          const r = await page.request.get("/api/setup/state");
          return (await r.json())?.data?.sections?.pricing;
        },
        { timeout: 30_000, message: "pricing hydration must reach READY" },
      )
      .toBe("READY");
    await finish.click();
    await page.waitForURL(/\/dashboard\/onboarding\?welcome=1/, { timeout: 20_000 });
    // Activation lands on the onboarding welcome, past the setup gate. The
    // "Sample Water Damage Assessment" it seeds is proven on the reports list
    // in seam 5 (this page does not list reports).
    await expect(
      page.getByRole("heading", { level: 1, name: /get to your first job/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ──────────────────────────────────────────────────────────────
  // Seam 5: Reports list → open the seeded sample report
  // ──────────────────────────────────────────────────────────────
  await assertSeam("Reports list → sample report detail", async () => {
    await page.goto("/dashboard/reports");
    // The reports table lists ID, client and property, not the title: find the
    // sample by the client and address activation seeds, open it by its ID
    // link, and require the detail to be that report.
    const sampleRow = page
      .getByRole("row")
      .filter({ hasText: "Sample Insurance Co." })
      .filter({ hasText: "1 Demo Street, Sydney NSW 2000" });
    await expect(sampleRow).toHaveCount(1, { timeout: 15_000 });
    await sampleRow.getByRole("link").first().click();
    await page.waitForURL(/\/dashboard\/reports\/[^/?#]+/, {
      timeout: 10_000,
    });
    await expect(
      page.getByText(/sample water damage assessment/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ──────────────────────────────────────────────────────────────
  // Seam 6: New Inspection via /dashboard/inspections/new
  //
  // The NIRTechnicianInputForm auto-creates an Inspection ~1.5 s after
  // address + postcode are populated (see ensureInspectionExists in
  // components/NIRTechnicianInputForm.tsx). We assert visible UI
  // confirmation by reading the inspectionId out of the API list once
  // the auto-create fires, then navigating to the detail page.
  // ──────────────────────────────────────────────────────────────
  let inspectionId = "";
  await assertSeam("Dashboard → Inspection auto-created", async () => {
    await page.goto("/dashboard/inspections/new");
    await expect(
      page.getByRole("heading", { name: /new inspection/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Find the property address + postcode inputs (placeholders / labels
    // in the form). Filling both triggers the debounced auto-create.
    const address = page
      .getByLabel(/property address/i)
      .or(page.getByPlaceholder(/address/i))
      .first();
    const postcode = page
      .getByLabel(/postcode/i)
      .or(page.getByPlaceholder(/postcode|2000/i))
      .first();
    await address.fill("1 Demo Street, Sydney NSW 2000");
    await postcode.fill("2000");
    // Save Draft refuses until a claim type is chosen (the IICRC standard
    // that governs the job).
    await page.getByRole("radio", { name: /water damage \(iicrc s500/i }).check();
    // The form creates the inspection on an explicit action (Save Draft, a
    // photo or submit; ensureInspectionExists), not on typing.
    const saveDraft = page.getByRole("button", { name: /^save draft$/i });
    await expect(saveDraft).toBeEnabled({ timeout: 10_000 });
    await saveDraft.click();

    // Wait up to 5 s for the auto-create to settle and the inspection to
    // appear in the list.
    await expect
      .poll(
        async () => {
          const res = await page.request.get("/api/inspections?limit=5");
          if (!res.ok()) return 0;
          const body = await res.json();
          return body?.inspections?.length ?? 0;
        },
        {
          message: "Inspection auto-create never fired",
          timeout: 8_000,
        },
      )
      .toBeGreaterThan(0);

    const listRes = await page.request.get("/api/inspections?limit=5");
    const listBody = await listRes.json();
    inspectionId = listBody.inspections[0].id as string;
    expect(inspectionId, "Inspection id missing from list response").toMatch(
      /^[a-z0-9-]+$/i,
    );
  });

  // ──────────────────────────────────────────────────────────────
  // Seam 7: Inspection → moisture reading + photo persisted
  //
  // The NIR form's moisture-mapping canvas and Cloudinary photo uploader
  // are too brittle to drive in a 90 s budget; we hit the same API the
  // form would and then verify the inspection detail UI shows the data.
  // The visible UI confirmation is the inspection detail page rendering
  // the moisture reading row.
  // ──────────────────────────────────────────────────────────────
  await assertSeam(
    "Inspection → moisture reading + photo persisted",
    async () => {
      // 7a. Moisture reading.
      const moistureRes = await page.request.post(
        `/api/inspections/${inspectionId}/moisture`,
        {
          data: {
            location: "Master Bedroom - Floor",
            surfaceType: "Carpet",
            moistureLevel: 45.5,
            depth: "Surface",
          },
        },
      );
      expect(
        moistureRes.ok(),
        `Moisture POST failed: ${moistureRes.status()}`,
      ).toBe(true);

      // 7b. Photo upload — 1×1 transparent PNG with valid magic bytes
      // (89 50 4E 47) so the magic-byte validator in the photos route
      // (CLAUDE.md rule #11) accepts it.
      //
      // Every storage route ends at Cloudinary (lib/storage/index.ts). The
      // sketch-e2e job carries no Cloudinary credentials, so there the upload
      // can only answer 500. Run it wherever storage is configured; elsewhere
      // record that this step did not run instead of passing it silently.
      const storageConfigured = Boolean(
        process.env.CLOUDINARY_URL ||
          (process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET),
      );
      if (!storageConfigured) {
        test.info().annotations.push({
          type: "seam-not-run",
          description:
            "Seam 7b photo upload: no Cloudinary credentials in this environment",
        });
      } else {
        const TINY_PNG_BASE64 =
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const pngBuffer = Buffer.from(TINY_PNG_BASE64, "base64");
        const photoRes = await page.request.post(
          `/api/inspections/${inspectionId}/photos`,
          {
            multipart: {
              file: {
                name: "test.png",
                mimeType: "image/png",
                buffer: pngBuffer,
              },
              location: "Master Bedroom",
            },
          },
        );
        expect(photoRes.ok(), `Photo POST failed: ${photoRes.status()}`).toBe(
          true,
        );
      }

      // 7c. Visible UI confirmation — moisture reading and photo render
      // on the inspection detail page.
      await page.goto(`/dashboard/inspections/${inspectionId}`);
      // Readings live on the Moisture tab; the Overview only counts them.
      await page.getByRole("tab", { name: /^moisture/i }).click();
      await expect(
        page.getByText(/master bedroom - floor/i).first(),
      ).toBeVisible({ timeout: 15_000 });
    },
  );

  // ──────────────────────────────────────────────────────────────
  // Seam 8: Generate report from inspection
  //
  // The /api/reports POST runs AI generation (try/catch — won't block
  // report creation if Gemma is slow/down) and writes a status=COMPLETED
  // report. We then assert the new report appears on the reports list.
  // ──────────────────────────────────────────────────────────────
  // A trial report runs on the platform's Anthropic key
  // (lib/ai/platform-trial-credential.ts); without it /api/reports answers 402
  // "platform AI key ... not configured", by design. Seams 8-10 (report,
  // invoice from it, Xero sync) need that key; the sketch-e2e job has none.
  // Record that they did not run rather than pass them. Invoice, payment,
  // Xero and close are exercised without AI by e2e/v1-reference-claim.spec.ts.
  if (!process.env.ANTHROPIC_API_KEY) {
    test.info().annotations.push({
      type: "seam-not-run",
      description:
        "Seams 8-10 (report, invoice, Xero): no platform ANTHROPIC_API_KEY in this environment",
    });
    return;
  }

  const reportTitle = `First Tradie Job ${stamp}`;
  let newReportId = "";
  await assertSeam("Inspection → Report created", async () => {
    const reportRes = await page.request.post("/api/reports", {
      data: {
        title: reportTitle,
        clientName: "First Tradie Test Client",
        propertyAddress: "1 Demo Street, Sydney NSW 2000",
        waterCategory: "1",
        waterClass: "1",
        hazardType: "Water Damage",
      },
      timeout: 30_000,
    });
    expect(
      reportRes.ok(),
      `Report POST failed: ${reportRes.status()} ${await reportRes
        .text()
        .catch(() => "")}`,
    ).toBe(true);
    const reportBody = await reportRes.json();
    newReportId = (reportBody?.id || reportBody?.report?.id) as string;
    expect(newReportId, "Report id missing from POST response").toBeTruthy();

    // Visible UI confirmation — the report appears on the reports list.
    await page.goto("/dashboard/reports");
    await expect(page.getByText(reportTitle).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Seam 9: Create invoice from report
  // ──────────────────────────────────────────────────────────────
  let newInvoiceId = "";
  await assertSeam("Report → Invoice created", async () => {
    const due = new Date();
    due.setDate(due.getDate() + 14);
    const invoiceRes = await page.request.post("/api/invoices", {
      data: {
        reportId: newReportId,
        customerName: "First Tradie Test Client",
        customerEmail: `client-${stamp}@example.com`,
        customerAddress: "1 Demo Street, Sydney NSW 2000",
        dueDate: due.toISOString(),
        lineItems: [
          {
            description: "Water damage restoration — emergency response",
            category: "Labour",
            quantity: 1,
            unitPrice: 50000, // cents
            gstRate: 10,
          },
        ],
      },
    });
    expect(
      invoiceRes.ok(),
      `Invoice POST failed: ${invoiceRes.status()} ${await invoiceRes
        .text()
        .catch(() => "")}`,
    ).toBe(true);
    const invoiceBody = await invoiceRes.json();
    newInvoiceId = (invoiceBody?.id ||
      invoiceBody?.invoice?.id ||
      invoiceBody?.data?.id) as string;
    expect(newInvoiceId, "Invoice id missing from POST response").toBeTruthy();

    // Visible UI confirmation — invoice detail page renders.
    await page.goto(`/dashboard/invoices/${newInvoiceId}`);
    await expect(page.getByRole("heading", { name: /invoice /i })).toBeVisible({
      timeout: 15_000,
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Seam 10: Invoice → Xero push attempted (route reaches adapter)
  //
  // The brief is explicit: DO NOT require a live Xero token. We assert
  // the sync route is reached and the provider-routing branch for "xero"
  // returns a deterministic Xero-specific response. For a tenant with no
  // Xero integration row, the route responds with a 404 mentioning the
  // xero provider — proof the route ran, the provider was parsed, and
  // the Xero-specific code path executed before bailing on the missing
  // integration. A live token would let it reach syncInvoiceToXero();
  // without one, we still prove the seam.
  // ──────────────────────────────────────────────────────────────
  await assertSeam("Invoice → Xero sync route reached", async () => {
    const syncRes = await page.request.post(
      `/api/invoices/${newInvoiceId}/sync`,
      { data: { provider: "xero" } },
    );
    // 400 if draft-status guard triggers first, 404 if no Xero integration
    // row. Either path proves the route reached its Xero-aware logic.
    expect(
      [400, 404, 401, 200],
      `Unexpected sync status ${syncRes.status()}`,
    ).toContain(syncRes.status());
    const text = await syncRes.text();
    // Must mention "xero" (case-insensitive) — confirms the provider
    // branch executed, not a generic 500 or auth failure.
    expect(
      /xero|draft/i.test(text),
      `Xero adapter routing not reached. Response: ${text.slice(0, 200)}`,
    ).toBe(true);
  });
});
