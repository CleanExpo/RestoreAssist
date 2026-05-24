// scripts/asc-1-0-3-resubmit.mjs
//
// RA-2073 — finalise the 1.0.3(14) submission to App Review:
//   1. Open in-flight version page
//   2. Sign in if cookies expired (waits up to 5 min for user MFA)
//   3. Remove the existing build attachment (1.0.2(12) — currently in
//      "Waiting for Review")
//   4. Attach 1.0.3(14) (waits for processing if not yet ready)
//   5. Replace the reviewer notes with the OAuth-architecture notes
//   6. Save → Submit for Review → confirm
//
// Reuses /tmp/chrome-asc-profile so Apple ID session cookies persist
// between runs. Reviewer credentials (REVIEWER_EMAIL / REVIEWER_PASSWORD)
// are kept in this file because every other asc-*.mjs script in this
// repo follows the same convention; do NOT echo them to chat.

import { chromium } from "@playwright/test";
import * as fs from "fs";

const APP_ID = "6761808113";
const TARGET = `https://appstoreconnect.apple.com/apps/${APP_ID}/distribution/ios/version/inflight`;
const PROFILE = "/tmp/chrome-asc-profile";
const SS = "/tmp/asc-1-0-3-screenshots";
const TARGET_BUILD_VERSION = "1.0.3";
const TARGET_BUILD_NUMBER = "14";

const REVIEWER_EMAIL = "reviewer@restoreassist.app";
const REVIEWER_PASSWORD = "LX8#xHDHKTB^&$DHN7Au";

const REVIEW_NOTES = [
  "Build 1.0.3 (14) — RA-2073 sign-in loop fix.",
  "",
  "WHAT CHANGED FROM 1.0.2 (12):",
  "Sign-in flow rewritten to use native iOS ASAuthorizationController",
  "via the @capgo/capacitor-social-login plugin. Continue with Apple",
  "now opens the native iOS sheet (not Safari View Controller). The",
  "Apple identity JWT is exchanged for a session cookie via",
  "/api/auth/native-token-exchange, with Set-Cookie landing directly",
  "in WKWebView's cookie jar — fixing the sign-in loop reported on",
  "1.0.2 (12).",
  "",
  "GUIDELINE 4.8 (LOGIN SERVICES):",
  "Continue with Google is hidden on iOS in this build (UI gated by",
  "Capacitor.isNativePlatform check). Apple Sign-In is the only",
  "external login offered on iOS, so 4.8 does not apply.",
  "Email/password remains available.",
  "",
  "REVIEWER ACCOUNT:",
  `Email: ${REVIEWER_EMAIL}`,
  "Password: see Sign-In Information above.",
  "",
  "Or: tap Continue with Apple — works for any Apple ID, account is",
  "auto-created on first sign-in with a 30-day Trial subscription.",
].join("\n");

fs.mkdirSync(SS, { recursive: true });

async function ss(page, name) {
  try {
    await page.screenshot({ path: `${SS}/${name}.png`, fullPage: true });
    console.log(`[asc] screenshot: ${name}`);
  } catch (e) {
    console.log(`[asc] screenshot ${name} failed: ${e.message}`);
  }
}

async function waitForSignIn(page) {
  if (page.url().includes("login") || page.url().includes("FAILED")) {
    console.log(
      "[asc] not signed in — please complete Apple ID + 2FA in the open Chrome window (5 min timeout)",
    );
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000);
      if (!page.url().includes("login") && !page.url().includes("FAILED")) {
        await page.goto(TARGET, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
        console.log("[asc] signed in");
        return;
      }
      process.stdout.write(".");
    }
    throw new Error("sign-in timeout");
  }
}

console.log("[asc] launching Chrome with persistent ASC profile…");
const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome",
  headless: false,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--profile-directory=Default",
  ],
  viewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
await page
  .goto(TARGET, { timeout: 30000, waitUntil: "domcontentloaded" })
  .catch(() => {});
await page.waitForTimeout(3000);
await waitForSignIn(page);

await ss(page, "01-inflight-loaded");
console.log("[asc] URL:", page.url());

// ---------------------------------------------------------------------------
// Step 1 — Remove from Review (if currently waiting)
// ---------------------------------------------------------------------------
const pageText = await page.evaluate(() => document.body.innerText);
const isInReview =
  pageText.includes("Waiting for Review") ||
  pageText.includes("In Review") ||
  pageText.includes("Remove from Review");
console.log(
  `[asc] in-flight version state — Waiting for Review: ${pageText.includes(
    "Waiting for Review",
  )}, In Review: ${pageText.includes("In Review")}, Remove from Review CTA: ${pageText.includes(
    "Remove from Review",
  )}`,
);

if (isInReview) {
  const removeEl = page.locator("text=Remove from Review").first();
  try {
    await removeEl.waitFor({ state: "visible", timeout: 5000 });
    await removeEl.click();
    await page.waitForTimeout(2000);
    const confirm = page
      .getByRole("button", { name: /Remove|OK|Confirm/i })
      .first();
    if (await confirm.isVisible({ timeout: 3000 })) {
      await confirm.click();
      await page.waitForTimeout(4000);
    }
    console.log("[asc] *** removed previous build from review ***");
    await ss(page, "02-removed-from-review");
    // Page state changes after removal — reload
    await page.goto(TARGET, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log(
      `[asc] couldn't click Remove from Review: ${e.message} — continuing`,
    );
    await ss(page, "02-no-remove-button");
  }
} else {
  console.log("[asc] not currently in review — skipping removal");
}

// ---------------------------------------------------------------------------
// Step 2 — Attach 1.0.3 (14)
// Waits for build to finish processing (TestFlight) if needed
// ---------------------------------------------------------------------------
async function tryAttachBuild() {
  // Try the "+" / "Add Build" button — different ASC layouts use different
  // labels. Look for any button mentioning Add Build OR a "+" near the Build
  // section.
  const addBtn = (await page
    .getByRole("button", { name: /Add Build|Select.*Build/i })
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false))
    ? page.getByRole("button", { name: /Add Build|Select.*Build/i }).first()
    : null;

  if (!addBtn) {
    // Fallback: scan all buttons for a + icon near "Build"
    const btns = await page.locator("button").all();
    for (const b of btns) {
      const aria = (await b.getAttribute("aria-label").catch(() => "")) || "";
      if (/add.*build/i.test(aria)) {
        await b.click();
        await page.waitForTimeout(2500);
        return true;
      }
    }
    return false;
  }

  await addBtn.click();
  await page.waitForTimeout(2500);
  return true;
}

const opened = await tryAttachBuild();
if (!opened) {
  console.log(
    "[asc] Add Build button not found — dumping interactive elements",
  );
  const allBtns = await page.locator("button").all();
  for (const b of allBtns.slice(0, 40)) {
    const t = (await b.textContent().catch(() => "")).trim();
    const a = (await b.getAttribute("aria-label").catch(() => "")) || "";
    if (t || a) console.log(`  > "${t}" | aria="${a}"`);
  }
  await ss(page, "03-no-add-build");
} else {
  await ss(page, "03-build-picker");

  // Wait up to 8 min for 1.0.3 (14) to appear in the picker
  let found = false;
  for (let attempt = 0; attempt < 16; attempt++) {
    const picker = await page.evaluate(() => document.body.innerText);
    if (picker.includes(`${TARGET_BUILD_VERSION} (${TARGET_BUILD_NUMBER})`)) {
      console.log(
        `[asc] ${TARGET_BUILD_VERSION} (${TARGET_BUILD_NUMBER}) is processed — selecting`,
      );
      found = true;
      break;
    }
    if (
      picker.includes("Processing") &&
      picker.includes(TARGET_BUILD_VERSION)
    ) {
      console.log(
        `[asc] ${TARGET_BUILD_VERSION} (${TARGET_BUILD_NUMBER}) still Processing — waiting 30s (attempt ${attempt + 1}/16)`,
      );
    } else {
      console.log(
        `[asc] build not visible yet — waiting 30s (attempt ${attempt + 1}/16)`,
      );
    }
    await page.waitForTimeout(30000);
    // Refresh the picker
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await tryAttachBuild();
    await page.waitForTimeout(2500);
  }
  if (!found) {
    console.log(
      `[asc] *** 1.0.3 (14) didn't appear in picker after 8min — abort ***`,
    );
    await ss(page, "03-build-not-ready");
    await browser.close();
    process.exit(2);
  }

  // Find the row containing "1.0.3 (14)" and click it
  const rows = await page
    .locator("tr, li, [role='option'], [role='row']")
    .all();
  for (const row of rows) {
    const txt = (await row.textContent().catch(() => "")).trim();
    if (
      txt.includes(`${TARGET_BUILD_VERSION} (${TARGET_BUILD_NUMBER})`) ||
      (txt.includes(TARGET_BUILD_VERSION) && txt.includes(TARGET_BUILD_NUMBER))
    ) {
      await row.click();
      await page.waitForTimeout(1500);
      console.log(
        `[asc] clicked row for ${TARGET_BUILD_VERSION} (${TARGET_BUILD_NUMBER})`,
      );
      break;
    }
  }
  const done = page
    .getByRole("button", { name: /^(Done|Select|Add|Save)$/i })
    .first();
  if (await done.isVisible({ timeout: 3000 })) {
    await done.click();
    await page.waitForTimeout(3000);
  }
  await ss(page, "04-build-attached");
}

// ---------------------------------------------------------------------------
// Step 3 — Update review notes
// ---------------------------------------------------------------------------
console.log("[asc] updating reviewer notes…");
const tas = await page.locator("textarea").all();
let notesUpdated = false;
for (const ta of tas) {
  const ph = (
    (await ta.getAttribute("placeholder").catch(() => "")) || ""
  ).toLowerCase();
  const labelledBy =
    (await ta.getAttribute("aria-labelledby").catch(() => "")) || "";
  const id = (await ta.getAttribute("id").catch(() => "")) || "";
  const surrounding = `${ph} ${labelledBy} ${id}`.toLowerCase();
  if (
    surrounding.includes("note") ||
    surrounding.includes("comment") ||
    surrounding.includes("review") ||
    tas.length === 1
  ) {
    await ta.click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Delete");
    await ta.fill(REVIEW_NOTES);
    notesUpdated = true;
    console.log("[asc] notes filled");
    break;
  }
}
if (!notesUpdated && tas.length > 0) {
  // Last-ditch: fill the largest textarea
  const ta = tas[tas.length - 1];
  await ta.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.press("Delete");
  await ta.fill(REVIEW_NOTES);
  console.log("[asc] notes filled (fallback to last textarea)");
}

// Reviewer creds — usually persist between submissions but refresh anyway
const inputs = await page.locator("input").all();
for (const inp of inputs) {
  const ph = (
    (await inp.getAttribute("placeholder").catch(() => "")) || ""
  ).toLowerCase();
  const type = (await inp.getAttribute("type").catch(() => "")) || "";
  if (ph.match(/user.?name|email|sign.?in/) && type !== "password") {
    await inp.fill(REVIEWER_EMAIL);
  }
  if (type === "password" || ph.includes("password")) {
    await inp.fill(REVIEWER_PASSWORD);
  }
}

await ss(page, "05-notes-filled");

// ---------------------------------------------------------------------------
// Step 4 — Save
// ---------------------------------------------------------------------------
const saveBtn = page.getByRole("button", { name: /^Save$/i }).first();
if (
  await saveBtn
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false)
) {
  // Wait until enabled
  for (let i = 0; i < 20; i++) {
    if (await saveBtn.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  if (await saveBtn.isEnabled().catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(4000);
    console.log("[asc] saved");
  } else {
    console.log("[asc] Save remained disabled — proceeding to Submit anyway");
  }
}
await ss(page, "06-saved");

// ---------------------------------------------------------------------------
// Step 5 — Submit for Review
// ---------------------------------------------------------------------------
const submitBtn = page
  .getByRole("button", { name: /Submit for Review|Add for Review/i })
  .first();
if (await submitBtn.isVisible({ timeout: 10000 })) {
  await submitBtn.click();
  await page.waitForTimeout(3000);
  // Confirmation modal
  const confirm = page
    .getByRole("button", { name: /^(Submit|Confirm|Yes)$/i })
    .first();
  if (await confirm.isVisible({ timeout: 5000 })) {
    await confirm.click();
    await page.waitForTimeout(5000);
  }
  console.log("[asc] *** SUBMITTED 1.0.3 (14) FOR REVIEW ***");
  await ss(page, "07-submitted");
} else {
  console.log(
    "[asc] no Submit for Review button — check screenshots for final state",
  );
  await ss(page, "07-no-submit");
}

console.log("[asc] final URL:", page.url());
console.log("[asc] screenshots in:", SS);
console.log("[asc] keeping window open for 60s so you can verify…");
await page.waitForTimeout(60000);
await browser.close();
